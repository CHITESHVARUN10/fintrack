import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/ledger_categories.dart';
import '../theme/finstack_theme.dart';
import 'brutal.dart';

Future<String?> _createCategory(BuildContext context) => showDialog<String>(
  context: context,
  builder: (_) => const _CreateCategoryDialog(),
);

class _CreateCategoryDialog extends StatefulWidget {
  const _CreateCategoryDialog();

  @override
  State<_CreateCategoryDialog> createState() => _CreateCategoryDialogState();
}

class _CreateCategoryDialogState extends State<_CreateCategoryDialog> {
  final name = TextEditingController();
  String? error;
  bool saving = false;

  @override
  void dispose() {
    name.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (saving) return;
    final value = name.text.trim();
    if (value.isEmpty || value.length > 50) {
      setState(() => error = 'Enter a name of 1 to 50 characters.');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final response = await ApiClient.dio.post<Map>(
        '/recipients/categories',
        data: {'name': value},
      );
      if (mounted) Navigator.pop(context, response.data!['category'] as String);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        saving = false;
        error = ApiClient.errorMessage(e, 'Could not create category.');
      });
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('New category'),
    content: TextField(
      controller: name,
      autofocus: true,
      enabled: !saving,
      maxLength: 50,
      textCapitalization: TextCapitalization.words,
      textInputAction: TextInputAction.done,
      onSubmitted: (_) => save(),
      decoration: InputDecoration(labelText: 'Category name', errorText: error),
    ),
    actions: [
      TextButton(
        onPressed: saving ? null : () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: saving ? null : save,
        child: Text(saving ? 'Creating…' : 'Create'),
      ),
    ],
  );
}

class CategoryChoice extends StatelessWidget {
  const CategoryChoice({
    super.key,
    required this.label,
    required this.value,
    required this.options,
    required this.onSelected,
    this.enabled = true,
  });

  final String label;
  final String value;
  final Map<String, String> options;
  final ValueChanged<String> onSelected;
  final bool enabled;

  Future<void> _choose(BuildContext context) async {
    final selection = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: FinStackColors.surface,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) =>
          _CategoryPicker(label: label, selected: value, options: options),
    );
    if (context.mounted && selection != null && selection != value) {
      onSelected(selection);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        label.toUpperCase(),
        style: FinStackType.caption.copyWith(
          fontSize: 10,
          letterSpacing: 0.7,
          height: 1.25,
          color: FinStackColors.onSurfaceVariant,
        ),
      ),
      const SizedBox(height: 6),
      OutlinedButton(
        onPressed: enabled ? () => _choose(context) : null,
        style: OutlinedButton.styleFrom(
          backgroundColor: FinStackColors.surface,
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(options[value] ?? value, textAlign: TextAlign.left),
            ),
            const Icon(Icons.expand_more, size: 20),
          ],
        ),
      ),
    ],
  );
}

class _CategoryPicker extends StatefulWidget {
  const _CategoryPicker({
    required this.label,
    required this.selected,
    required this.options,
  });

  final String label;
  final String selected;
  final Map<String, String> options;

  @override
  State<_CategoryPicker> createState() => _CategoryPickerState();
}

class _CategoryPickerState extends State<_CategoryPicker> {
  String query = '';

  @override
  Widget build(BuildContext context) {
    final rows =
        widget.options.entries
            .where((entry) => entry.value.toLowerCase().contains(query))
            .toList()
          ..sort((a, b) {
            if (a.key == b.key) return 0;
            if (a.key == widget.selected) return -1;
            if (b.key == widget.selected) return 1;
            return a.value.toLowerCase().compareTo(b.value.toLowerCase());
          });
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: .78,
          minChildSize: .5,
          maxChildSize: .96,
          builder: (_, scroll) => Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Semantics(
                            header: true,
                            child: Text(
                              'Choose ${widget.label.toLowerCase()}',
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        BrutalIconButton(
                          icon: Icons.close,
                          tooltip: 'Close category picker',
                          size: 44,
                          color: FinStackColors.surfaceContainer,
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      decoration: InputDecoration(
                        labelText: 'Search ${widget.label.toLowerCase()}',
                        prefixIcon: const Icon(Icons.search),
                      ),
                      onChanged: (text) =>
                          setState(() => query = text.trim().toLowerCase()),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.separated(
                  controller: scroll,
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                  itemCount: rows.isEmpty ? 1 : rows.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    if (rows.isEmpty) {
                      return const ListTile(
                        title: Text('No matching categories'),
                      );
                    }
                    final row = rows[index];
                    final selected = row.key == widget.selected;
                    return ListTile(
                      selected: selected,
                      selectedColor: FinStackColors.onSurface,
                      selectedTileColor: FinStackColors.surfaceLow,
                      title: Text(row.value),
                      trailing: selected
                          ? const Icon(Icons.check, size: 20)
                          : null,
                      onTap: () => Navigator.of(context).pop(row.key),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class CategoryFields extends StatelessWidget {
  const CategoryFields({
    super.key,
    required this.category,
    required this.subcategory,
    required this.categories,
    required this.enabled,
    required this.onChanged,
    required this.onCreated,
  });

  final String category;
  final String subcategory;
  final Set<String> categories;
  final bool enabled;
  final void Function(String, String) onChanged;
  final ValueChanged<String> onCreated;

  @override
  Widget build(BuildContext context) {
    final subcategories =
        ledgerFinanceSubcategories[category] ?? const <String>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CategoryChoice(
          label: 'Category',
          value: category,
          options: {
            for (final name in {...categories, category}) name: name,
          },
          onSelected: (value) => onChanged(value, ''),
          enabled: enabled,
        ),
        if (subcategories.isNotEmpty || subcategory.isNotEmpty) ...[
          const SizedBox(height: 8),
          CategoryChoice(
            label: 'Subcategory',
            value: subcategory,
            options: {
              '': 'None',
              for (final item in {
                ...subcategories,
                if (subcategory.isNotEmpty) subcategory,
              })
                item: item,
            },
            onSelected: (value) => onChanged(category, value),
            enabled: enabled,
          ),
        ],
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            icon: const Icon(Icons.add, size: 18),
            label: const Text('New category'),
            onPressed: !enabled
                ? null
                : () async {
                    final name = await _createCategory(context);
                    if (name == null || !context.mounted) return;
                    onCreated(name);
                    onChanged(name, '');
                  },
          ),
        ),
      ],
    );
  }
}
