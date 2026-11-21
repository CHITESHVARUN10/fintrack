import 'package:flutter/material.dart';

import '../theme/finstack_theme.dart';
import 'brutal.dart';

class WorkspaceScaffold extends StatelessWidget {
  const WorkspaceScaffold({
    super.key,
    required this.title,
    required this.body,
    this.action,
  });

  final String title;
  final Widget body;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      automaticallyImplyLeading: false,
      leadingWidth: 54,
      leading: Navigator.canPop(context)
          ? Center(
              child: BrutalIconButton(
                icon: Icons.arrow_back,
                tooltip: 'Back',
                color: Colors.white,
                size: 34,
                onPressed: () => Navigator.maybePop(context),
              ),
            )
          : null,
      title: Text(title.toUpperCase()),
      actions: [
        if (action != null)
          Padding(padding: const EdgeInsets.only(right: 14), child: action!),
      ],
    ),
    body: BrutalGrid(child: body),
  );
}

class WorkspaceIntro extends StatelessWidget {
  const WorkspaceIntro(this.title, this.description, {super.key});

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Semantics(
        header: true,
        child: Text(
          title.toUpperCase(),
          style: FinStackType.caption.copyWith(color: FinStackColors.onSurface),
        ),
      ),
      const SizedBox(height: 3),
      Text(description, style: Theme.of(context).textTheme.bodySmall),
    ],
  );
}

class WorkspaceTotal extends StatelessWidget {
  const WorkspaceTotal({super.key, required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => BrutalCard(
    color: FinStackColors.onSurface,
    shadowColor: FinStackColors.brandYellow,
    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
    child: Row(
      children: [
        Expanded(
          child: Text(
            label.toUpperCase(),
            style: FinStackType.caption.copyWith(color: Colors.white),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: FinStackType.amount.copyWith(
              color: FinStackColors.brandYellow,
            ),
          ),
        ),
      ],
    ),
  );
}

class WorkspaceItemActions extends StatelessWidget {
  const WorkspaceItemActions({
    super.key,
    required this.onEdit,
    required this.onRemove,
    this.removeLabel = 'Delete',
  });

  final VoidCallback onEdit;
  final VoidCallback onRemove;
  final String removeLabel;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      BrutalIconButton(
        icon: Icons.edit_outlined,
        tooltip: 'Edit',
        color: Colors.white,
        size: 34,
        onPressed: onEdit,
      ),
      const SizedBox(width: 6),
      BrutalIconButton(
        icon: Icons.delete_outline,
        tooltip: removeLabel,
        color: FinStackColors.errorContainer,
        size: 34,
        onPressed: onRemove,
      ),
    ],
  );
}

class WorkspaceScheduledCard extends StatelessWidget {
  const WorkspaceScheduledCard({
    super.key,
    required this.title,
    required this.category,
    required this.amount,
    required this.detail,
    required this.onEdit,
    required this.onDelete,
  });

  final String title;
  final String category;
  final String amount;
  final String detail;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) => BrutalCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 5),
                  BrutalTag(label: category, color: Colors.white),
                ],
              ),
            ),
            WorkspaceItemActions(onEdit: onEdit, onRemove: onDelete),
          ],
        ),
        const SizedBox(height: 8),
        Text(amount, style: FinStackType.amount.copyWith(fontSize: 21)),
        const SizedBox(height: 3),
        Text(detail, style: Theme.of(context).textTheme.bodySmall),
      ],
    ),
  );
}

class WorkspaceSheetTitle extends StatelessWidget {
  const WorkspaceSheetTitle(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Semantics(
          header: true,
          child: Text(title, style: Theme.of(context).textTheme.titleLarge),
        ),
      ),
      BrutalIconButton(
        icon: Icons.close,
        tooltip: 'Close',
        size: 32,
        color: Colors.white,
        onPressed: () => Navigator.maybePop(context),
      ),
    ],
  );
}
