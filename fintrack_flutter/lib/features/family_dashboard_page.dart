import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../core/api_client.dart';
import '../core/format.dart';
import '../core/vendor_name.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/states.dart';

class FamilyDashboardPage extends StatefulWidget {
  const FamilyDashboardPage({super.key});
  @override
  State<FamilyDashboardPage> createState() => _FamilyDashboardPageState();
}

/// Safe substring helpers — fl_chart calls title builders with fractional
/// values and backend labels/dates can be shorter than expected.
String _safeTrunc(String s, int n) => s.length <= n ? s : s.substring(0, n);
String _safeRange(String s, int start, [int? end]) {
  if (s.length <= start) return s;
  final e = end ?? s.length;
  return s.substring(start, e > s.length ? s.length : e);
}

class _FamilyDashboardPageState extends State<FamilyDashboardPage> {
  Map? data;
  bool loading = true;
  String? error;
  DateTime? from = DateTime(DateTime.now().year, DateTime.now().month, 1);
  DateTime? to = DateTime.now();
  List members = [];
  List<String> selMembers = [];
  List<String> selModes = [];
  static const modes = ['UPI', 'BANK', 'CASH', 'CARD', 'OTHER'];

  @override
  void initState() {
    super.initState();
    fetchMembers();
    load();
  }

  Future<void> fetchMembers() async {
    try {
      final me = await ApiClient.dio.get('/families/me');
      final fid = me.data['family']?['_id'];
      if (fid == null) return;
      final res = await ApiClient.dio.get('/families/$fid/members');
      if (!mounted) return;
      setState(() => members = (res.data['members'] as List?) ?? []);
    } catch (_) {}
  }

  String _mid(Map m) => '${m['id'] ?? m['_id'] ?? ''}';

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final qp = <String, dynamic>{};
      if (from != null) qp['from'] = from!.toIso8601String().substring(0, 10);
      if (to != null) qp['to'] = to!.toIso8601String().substring(0, 10);
      if (selMembers.isNotEmpty) qp['members'] = selMembers.join(',');
      if (selModes.isNotEmpty) qp['modes'] = selModes.join(',');
      final res = await ApiClient.dio.get(
        '/analytics/family',
        queryParameters: qp,
      );
      if (!mounted) return;
      setState(() => data = res.data);
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Could not load family analytics. Check your connection and retry.',
        );
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> clearFilters() async {
    setState(() {
      selMembers = [];
      selModes = [];
    });
    await load();
  }

  Widget _dateField(String label, DateTime? value, bool isFrom) {
    return OutlinedButton(
      onPressed: () async {
        final d = await showDatePicker(
          context: context,
          firstDate: DateTime(2020),
          lastDate: DateTime(2030),
          initialDate: value ?? DateTime.now(),
        );
        if (d != null) {
          setState(() {
            if (isFrom) {
              from = d;
            } else {
              to = d;
            }
          });
        }
      },
      style: OutlinedButton.styleFrom(
        backgroundColor: FinStackColors.surfaceContainer,
        minimumSize: const Size(44, 44),
      ),
      child: Text(
        value == null ? label : dateLabel(value),
        overflow: TextOverflow.ellipsis,
        style: FinStackType.caption,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = data?['summary'];
    final timeSeries = (data?['timeSeries'] as List?) ?? [];
    final byCategory = (data?['byCategory'] as List?) ?? [];
    final byMember = (data?['byMember'] as List?) ?? [];
    final topVendors = (data?['topVendors'] as List?) ?? [];
    final heatmap = (data?['heatmap'] as List?) ?? [];
    final highestDay = data?['highestDay'];
    double daySpend(Map item) => double.tryParse('${item['spendPaise']}') ?? 0;
    final maxSpend = heatmap
        .whereType<Map>()
        .map(daySpend)
        .fold<double>(0, (max, spend) => spend > max ? spend : max);

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 14, 19, 26),
      children: [
        const Padding(
          padding: EdgeInsets.only(bottom: 10),
          child: Text(
            'Only months your family has shared are included. Manage yours in Profile → Privacy & sharing.',
            style: TextStyle(
              fontSize: 11,
              height: 1.4,
              color: FinStackColors.onSurfaceVariant,
            ),
          ),
        ),
        BrutalCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                spacing: 8,
                children: [
                  Expanded(child: _dateField('From', from, true)),
                  Expanded(child: _dateField('To', to, false)),
                ],
              ),
              const SizedBox(height: 9),
              BrutalButton(
                label: 'Apply',
                block: true,
                onPressed: loading ? null : load,
              ),
              const SizedBox(height: 12),
              const Text('MEMBERS', style: FinStackType.caption),
              const SizedBox(height: 4),
              if (members.isEmpty)
                const Text(
                  'No family members found.',
                  style: TextStyle(fontSize: 11),
                )
              else
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: members.map((m) {
                    final id = _mid(Map<String, dynamic>.from(m as Map));
                    final name = '${m['name'] ?? m['email'] ?? '?'}';
                    final active = selMembers.contains(id);
                    return FilterChip(
                      label: Text(name, style: FinStackType.caption),
                      selected: active,
                      onSelected: (selected) => setState(() {
                        selected ? selMembers.add(id) : selMembers.remove(id);
                      }),
                    );
                  }).toList(),
                ),
              const SizedBox(height: 8),
              const Text('MODE', style: FinStackType.caption),
              const SizedBox(height: 4),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: modes.map((m) {
                  final active = selModes.contains(m);
                  return FilterChip(
                    label: Text(m, style: FinStackType.caption),
                    selected: active,
                    onSelected: (selected) => setState(() {
                      selected ? selModes.add(m) : selModes.remove(m);
                    }),
                  );
                }).toList(),
              ),
              if (selMembers.isNotEmpty || selModes.isNotEmpty) ...[
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: BrutalButton(
                    label: 'Clear filters',
                    onPressed: clearFilters,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (loading)
          const BrutalCard(
            child: Row(
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 3,
                    color: FinStackColors.onSurface,
                  ),
                ),
                SizedBox(width: 10),
                Text(
                  'Loading analytics…',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          )
        else if (error != null)
          BrutalCard(
            color: FinStackColors.errorContainer,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  error!,
                  style: const TextStyle(
                    color: FinStackColors.onErrorContainer,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                BrutalButton(
                  label: 'Retry',
                  icon: Icons.refresh,
                  onPressed: load,
                ),
              ],
            ),
          )
        else if (data == null)
          const BrutalEmpty(
            message: 'No data yet. Join a family and add transactions.',
          )
        else ...[
          LayoutBuilder(
            builder: (context, constraints) {
              final cell = (constraints.maxWidth - 8) / 2;
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  SizedBox(
                    width: cell,
                    child: _Kpi(
                      label: 'Actual Spend',
                      value: inr(
                        ((s?['actualExpenditurePaise'] ?? 0) as num) / 100,
                      ),
                      color: FinStackColors.brandYellow,
                    ),
                  ),
                  SizedBox(
                    width: cell,
                    child: _Kpi(
                      label: 'Avg / day',
                      value: inr((data?['avgDaily'] ?? 0) as num),
                      color: FinStackColors.tertiary,
                    ),
                  ),
                  SizedBox(
                    width: cell,
                    child: _Kpi(
                      label: 'Total',
                      value: '${data?['totalCount'] ?? 0} txns',
                    ),
                  ),
                  if (highestDay != null)
                    SizedBox(
                      width: cell,
                      child: _Kpi(
                        label: 'Highest',
                        value: '${highestDay['date']}',
                      ),
                    ),
                ],
              );
            },
          ),
          const SizedBox(height: 12),
          BrutalCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const BrutalSectionTitle(
                  title: 'Spend over time',
                  accent: FinStackColors.chartTeal,
                ),
                const SizedBox(height: 12),
                Builder(
                  builder: (context) {
                    final spots = <FlSpot>[
                      for (int i = 0; i < timeSeries.length; i++)
                        FlSpot(
                          i.toDouble(),
                          (timeSeries[i]['spend'] as num).toDouble(),
                        ),
                    ];
                    return SizedBox(
                      height: timeSeries.isEmpty ? 96 : 180,
                      child: timeSeries.isEmpty
                          ? const Center(child: Text('No spend in range'))
                          : LineChart(
                              LineChartData(
                                gridData: FlGridData(
                                  show: true,
                                  drawVerticalLine: false,
                                  getDrawingHorizontalLine: (v) => const FlLine(
                                    color: FinStackColors.chartGrid,
                                    strokeWidth: 1,
                                    dashArray: [2, 6],
                                  ),
                                ),
                                borderData: FlBorderData(show: false),
                                titlesData: FlTitlesData(
                                  show: true,
                                  bottomTitles: AxisTitles(
                                    sideTitles: SideTitles(
                                      showTitles: true,
                                      reservedSize: 24,
                                      interval: 1,
                                      getTitlesWidget: (v, meta) {
                                        final i = v.toInt();
                                        final stride = (timeSeries.length / 5)
                                            .ceil();
                                        if (v != i.toDouble() ||
                                            i < 0 ||
                                            i >= timeSeries.length ||
                                            (i % stride != 0 &&
                                                i != timeSeries.length - 1)) {
                                          return const SizedBox();
                                        }
                                        return Text(
                                          _safeRange(
                                            timeSeries[i]['date'].toString(),
                                            5,
                                            10,
                                          ),
                                          style: FinStackType.caption.copyWith(
                                            fontSize: 8,
                                          ),
                                        );
                                      },
                                    ),
                                  ),
                                  leftTitles: AxisTitles(
                                    sideTitles: SideTitles(
                                      showTitles: true,
                                      reservedSize: 42,
                                      getTitlesWidget: (v, meta) => Text(
                                        compactInr(v),
                                        style: const TextStyle(fontSize: 8),
                                      ),
                                    ),
                                  ),
                                  topTitles: const AxisTitles(
                                    sideTitles: SideTitles(showTitles: false),
                                  ),
                                  rightTitles: const AxisTitles(
                                    sideTitles: SideTitles(showTitles: false),
                                  ),
                                ),
                                lineBarsData: [
                                  LineChartBarData(
                                    spots: spots,
                                    isCurved: true,
                                    curveSmoothness: 0.28,
                                    color: FinStackColors.chartTeal,
                                    barWidth: 2.8,
                                    isStrokeCapRound: true,
                                    dotData: const FlDotData(show: false),
                                    belowBarData: BarAreaData(
                                      show: true,
                                      gradient: LinearGradient(
                                        begin: Alignment.topCenter,
                                        end: Alignment.bottomCenter,
                                        colors: [
                                          FinStackColors.chartTeal.withValues(
                                            alpha: 0.30,
                                          ),
                                          FinStackColors.chartTeal.withValues(
                                            alpha: 0.01,
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              duration: const Duration(milliseconds: 450),
                              curve: Curves.easeOutCubic,
                            ),
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          BrutalCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const BrutalSectionTitle(
                  title: 'By category',
                  accent: FinStackColors.accentPink,
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: byCategory.isEmpty ? 72 : 180,
                  child: byCategory.isEmpty
                      ? const Center(child: Text('No data'))
                      : BarChart(
                          BarChartData(
                            gridData: FlGridData(
                              show: true,
                              drawVerticalLine: false,
                              getDrawingHorizontalLine: (v) => const FlLine(
                                color: FinStackColors.chartGrid,
                                strokeWidth: 1,
                                dashArray: [2, 6],
                              ),
                            ),
                            borderData: FlBorderData(show: false),
                            titlesData: FlTitlesData(
                              bottomTitles: AxisTitles(
                                sideTitles: SideTitles(
                                  showTitles: true,
                                  interval: 1,
                                  getTitlesWidget: (v, meta) {
                                    final i = v.toInt();
                                    if (v != i.toDouble() ||
                                        i < 0 ||
                                        i >= byCategory.length) {
                                      return const SizedBox();
                                    }
                                    return Padding(
                                      padding: const EdgeInsets.only(top: 4),
                                      child: Text(
                                        _safeTrunc(
                                          byCategory[i]['category'].toString(),
                                          6,
                                        ),
                                        style: const TextStyle(fontSize: 8),
                                      ),
                                    );
                                  },
                                ),
                              ),
                              leftTitles: AxisTitles(
                                sideTitles: SideTitles(
                                  showTitles: true,
                                  reservedSize: 42,
                                  getTitlesWidget: (v, meta) => Text(
                                    compactInr(v),
                                    style: const TextStyle(fontSize: 8),
                                  ),
                                ),
                              ),
                              topTitles: const AxisTitles(
                                sideTitles: SideTitles(showTitles: false),
                              ),
                              rightTitles: const AxisTitles(
                                sideTitles: SideTitles(showTitles: false),
                              ),
                            ),
                            barGroups: [
                              for (int i = 0; i < byCategory.length; i++)
                                BarChartGroupData(
                                  x: i,
                                  barRods: [
                                    BarChartRodData(
                                      toY: (byCategory[i]['spend'] as num)
                                          .toDouble(),
                                      width: 12,
                                      color: FinStackColors.brandYellow,
                                      borderRadius: const BorderRadius.vertical(
                                        top: Radius.circular(3),
                                      ),
                                      borderSide: const BorderSide(
                                        color: FinStackColors.onSurface,
                                        width: 1.5,
                                      ),
                                    ),
                                  ],
                                ),
                            ],
                          ),
                          duration: const Duration(milliseconds: 450),
                          curve: Curves.easeOutCubic,
                        ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          BrutalCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const BrutalSectionTitle(
                  title: 'By member',
                  accent: FinStackColors.tertiary,
                ),
                const SizedBox(height: 8),
                ...byMember.map(
                  (m) => Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    padding: const EdgeInsets.all(8),
                    decoration: brutal(border: 2, shadow: 2),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          m['name'].toString(),
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                        Text(
                          '₹${m['spend']}',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                ),
                if (byMember.isEmpty)
                  const Text('No data', style: TextStyle(fontSize: 12)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          BrutalCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const BrutalSectionTitle(
                  title: 'Top vendors',
                  accent: FinStackColors.accentOrange,
                ),
                const SizedBox(height: 8),
                ...topVendors.map(
                  (v) => Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      border: Border.all(
                        width: 2,
                        color: FinStackColors.onSurface,
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            readableVendorName(v['vendor'].toString()),
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Text(
                          '${inr((v['spend'] as num?) ?? 0)} ×${v['count']}',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                ),
                if (topVendors.isEmpty) const Text('No vendors'),
              ],
            ),
          ),
          const SizedBox(height: 12),
          BrutalCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const BrutalSectionTitle(
                  title: 'Daily heatmap',
                  accent: FinStackColors.brandYellow,
                ),
                const SizedBox(height: 8),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 7,
                    crossAxisSpacing: 4,
                    mainAxisSpacing: 4,
                  ),
                  itemCount: heatmap.length,
                  itemBuilder: (c, i) {
                    final h = heatmap[i];
                    final ratio = maxSpend > 0
                        ? daySpend(h as Map) / maxSpend
                        : 0;
                    final bg = ratio > 0.66
                        ? FinStackColors.onSurface
                        : ratio > 0.33
                        ? const Color(0xFF6B6A5E)
                        : FinStackColors.surfaceContainer;
                    final fg = ratio > 0.33
                        ? Colors.white
                        : FinStackColors.onSurface;
                    final isMax =
                        highestDay != null && h['date'] == highestDay['date'];
                    return Container(
                      decoration: BoxDecoration(
                        color: bg,
                        border: Border.all(
                          width: isMax ? 3 : 1.5,
                          color: isMax
                              ? FinStackColors.brandYellow
                              : FinStackColors.onSurface,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          _safeRange(h['date'].toString(), 5, 10),
                          style: TextStyle(
                            fontFamily: FinStackType.mono,
                            fontSize: 8,
                            color: fg,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _Kpi extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _Kpi({
    required this.label,
    required this.value,
    this.color = Colors.white,
  });
  @override
  Widget build(BuildContext context) => Container(
    decoration: brutal(color: color, border: 2, shadow: 3),
    padding: const EdgeInsets.all(10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontFamily: FinStackType.mono,
            fontSize: 10,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: FinStackType.amount.copyWith(
            fontSize: label == 'Highest' ? 15 : 19,
          ),
        ),
      ],
    ),
  );
}
