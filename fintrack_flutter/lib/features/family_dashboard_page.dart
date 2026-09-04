import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../core/api_client.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';

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
    setState(() => loading = true);
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
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> clearFilters() async {
    setState(() { selMembers = []; selModes = []; });
    await load();
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

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        BrutalCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'FAMILY DASHBOARD',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () async {
                        final d = await showDatePicker(
                          context: context,
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2030),
                          initialDate: from ?? DateTime.now(),
                        );
                        if (d != null) setState(() => from = d);
                      },
                      child: Text(
                        from == null
                            ? 'From'
                            : from!.toIso8601String().substring(0, 10),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () async {
                        final d = await showDatePicker(
                          context: context,
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2030),
                          initialDate: to ?? DateTime.now(),
                        );
                        if (d != null) setState(() => to = d);
                      },
                      child: Text(
                        to == null
                            ? 'To'
                            : to!.toIso8601String().substring(0, 10),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  BrutalButton(label: 'Apply', onPressed: load),
                ],
              ),
              const SizedBox(height: 8),
              const Text('MEMBERS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              if (members.isEmpty)
                const Text('No family members found.', style: TextStyle(fontSize: 11))
              else
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: members.map((m) {
                    final id = _mid(Map<String, dynamic>.from(m as Map));
                    final name = '${m['name'] ?? m['email'] ?? '?'}';
                    final active = selMembers.contains(id);
                    return GestureDetector(
                      onTap: () => setState(() {
                        active ? selMembers.remove(id) : selMembers.add(id);
                      }),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: active ? FinStackColors.brandYellow : Colors.white,
                          border: Border.all(width: 2, color: FinStackColors.onSurface),
                        ),
                        child: Text(name, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                      ),
                    );
                  }).toList(),
                ),
              const SizedBox(height: 8),
              const Text('MODE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: modes.map((m) {
                  final active = selModes.contains(m);
                  return GestureDetector(
                    onTap: () => setState(() {
                      active ? selModes.remove(m) : selModes.add(m);
                    }),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: active ? FinStackColors.brandYellow : Colors.white,
                        border: Border.all(width: 2, color: FinStackColors.onSurface),
                      ),
                      child: Text(m, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                    ),
                  );
                }).toList(),
              ),
              if (selMembers.isNotEmpty || selModes.isNotEmpty) ...[
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: BrutalButton(label: 'Clear filters', onPressed: clearFilters),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (loading)
          const Center(child: CircularProgressIndicator())
        else if (data == null)
          const BrutalCard(
            child: Text('No data. Join a family and add transactions.'),
          )
        else ...[
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Kpi(
                label: 'Actual Spend',
                value:
                    '₹${((s?['actualExpenditurePaise'] ?? 0) / 100).toStringAsFixed(0)}',
              ),
              _Kpi(
                label: 'Avg / day',
                value: '₹${(data?['avgDaily'] ?? 0).toString()}',
              ),
              _Kpi(label: 'Total', value: '${data?['totalCount'] ?? 0} txns'),
              if (highestDay != null)
                _Kpi(label: 'Highest', value: '${highestDay['date']}'),
            ],
          ),
          const SizedBox(height: 12),
          BrutalCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'SPEND OVER TIME',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
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
                      height: 180,
                      child: timeSeries.isEmpty
                          ? const Center(child: Text('No spend in range'))
                          : LineChart(
                              LineChartData(
                                gridData: const FlGridData(
                                  show: true,
                                  drawVerticalLine: false,
                                ),
                                borderData: FlBorderData(
                                  show: true,
                                  border: const Border(
                                    bottom: BorderSide(width: 3),
                                    left: BorderSide(width: 3),
                                  ),
                                ),
                                titlesData: FlTitlesData(
                                  show: true,
                                  bottomTitles: AxisTitles(
                                    sideTitles: SideTitles(
                                      showTitles: true,
                                      reservedSize: 24,
                                      interval: 1,
                                      getTitlesWidget: (v, meta) {
                                        final i = v.toInt();
                                        if (v != i.toDouble() || i < 0 || i >= timeSeries.length) {
                                          return const SizedBox();
                                        }
                                        return Text(
                                          _safeRange(timeSeries[i]['date'].toString(), 5, 10),
                                          style: const TextStyle(fontSize: 8),
                                        );
                                      },
                                    ),
                                  ),
                                ),
                                lineBarsData: [
                                  LineChartBarData(
                                    spots: spots,
                                    isCurved: false,
                                    color: FinStackColors.onSurface,
                                    barWidth: 3,
                                    dotData: const FlDotData(show: true),
                                    belowBarData: BarAreaData(
                                      show: true,
                                      color: FinStackColors.brandYellow,
                                    ),
                                  ),
                                ],
                              ),
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
                const Text(
                  'BY CATEGORY',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 180,
                  child: byCategory.isEmpty
                      ? const Center(child: Text('No data'))
                      : BarChart(
                          BarChartData(
                            gridData: FlGridData(show: true),
                            borderData: FlBorderData(show: true),
                            titlesData: FlTitlesData(
                              bottomTitles: AxisTitles(
                                sideTitles: SideTitles(
                                  showTitles: true,
                                  interval: 1,
                                  getTitlesWidget: (v, meta) {
                                    final i = v.toInt();
                                    if (v != i.toDouble() || i < 0 || i >= byCategory.length) {
                                      return const SizedBox();
                                    }
                                    return Padding(
                                      padding: const EdgeInsets.only(top: 4),
                                      child: Text(
                                        _safeTrunc(byCategory[i]['category'].toString(), 6),
                                        style: const TextStyle(fontSize: 8),
                                      ),
                                    );
                                  },
                                ),
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
                                      color: FinStackColors.onSurface,
                                      width: 14,
                                    ),
                                  ],
                                ),
                            ],
                          ),
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
                const Text(
                  'BY MEMBER',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
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
                const Text(
                  'TOP VENDORS',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
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
                            v['vendor'].toString(),
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Text(
                          '₹${v['spend']} ×${v['count']}',
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
                const Text(
                  'DAILY HEATMAP',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
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
                    final max = heatmap
                        .map((e) => (e['spendPaise'] as num).toDouble())
                        .reduce((a, b) => a > b ? a : b);
                    final ratio = max > 0
                        ? (h['spendPaise'] as num).toDouble() / max
                        : 0;
                    final bg = ratio > 0.66
                        ? FinStackColors.onSurface
                        : ratio > 0.33
                        ? const Color(0xFF6B6A5E)
                        : const Color(0xFFE9E2CF);
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
                            fontSize: 7,
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
  const _Kpi({required this.label, required this.value});
  @override
  Widget build(BuildContext context) => Container(
    decoration: brutal(border: 2, shadow: 2),
    padding: const EdgeInsets.all(10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
      ],
    ),
  );
}
