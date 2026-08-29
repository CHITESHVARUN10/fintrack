import 'package:flutter/material.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import 'transactions_page.dart';
import 'family_page.dart';
import 'import_page.dart';
import 'budgets_page.dart';
import 'family_dashboard_page.dart';

class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int idx = 0;
  final pages = [const TransactionsPage(), const FamilyDashboardPage(), const FamilyPage(), const ImportPageWidget(), const BudgetsPage()];
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('FINSTACK', style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: -0.5)), centerTitle: false),
      body: pages[idx],
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: FinStackColors.onSurface, width: 3))),
        child: BottomNavigationBar(currentIndex: idx, onTap: (i)=> setState(()=> idx=i), type: BottomNavigationBarType.fixed, selectedItemColor: FinStackColors.onSurface, unselectedItemColor: FinStackColors.onSurfaceVariant, backgroundColor: Colors.white, items: const [BottomNavigationBarItem(icon: Icon(Icons.receipt_long), label: 'Transactions'), BottomNavigationBarItem(icon: Icon(Icons.analytics), label: 'Dashboard'), BottomNavigationBarItem(icon: Icon(Icons.group), label: 'Family'), BottomNavigationBarItem(icon: Icon(Icons.upload_file), label: 'Import'), BottomNavigationBarItem(icon: Icon(Icons.savings), label: 'Budgets')]),
      ),
    );
  }
}
