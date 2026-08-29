import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'theme/finstack_theme.dart';
import 'features/shell.dart';

void main() { runApp(const ProviderScope(child: FinStackApp())); }

class FinStackApp extends StatelessWidget {
  const FinStackApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(title: 'FinStack', theme: finStackTheme(), home: const Shell());
  }
}
