import 'package:flutter/material.dart';

import '../theme/finstack_theme.dart';

Future<bool> confirmAction(
  BuildContext context, {
  required String title,
  required String message,
  required String action,
}) async {
  return await showDialog<bool>(
        context: context,
        barrierColor: Colors.black54,
        builder: (dialogContext) {
          void close(bool result) {
            if (ModalRoute.of(dialogContext)?.isCurrent == true) {
              Navigator.of(dialogContext).pop(result);
            }
          }

          return AlertDialog(
            backgroundColor: FinStackColors.surfaceContainer,
            title: Text(title),
            content: Text(message),
            actions: [
              OutlinedButton(
                onPressed: () => close(false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => close(true),
                style: FilledButton.styleFrom(
                  backgroundColor: FinStackColors.onErrorContainer,
                  foregroundColor: FinStackColors.inkOn(
                    FinStackColors.onErrorContainer,
                  ),
                ),
                child: Text(action),
              ),
            ],
          );
        },
      ) ??
      false;
}
