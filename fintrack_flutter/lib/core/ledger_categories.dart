import 'api_client.dart';

const ledgerCategories = [
  'Groceries',
  'Food',
  'Electricity',
  'Rent',
  'Transportation',
  'Shopping',
  'Medical',
  'Education',
  'Entertainment',
  'Bills',
  'Household',
  'Proxy',
  'Family',
  'Internal Transfer',
  'Investment',
  'Income',
  'Other',
];

const ledgerFinanceSubcategories = {
  'Investment': ['Fixed Deposit', 'Stocks'],
  'Income': [
    'Salary',
    'Freelance',
    'Pocket Money',
    'Rental',
    'Business',
    'Regular',
    'Variable',
  ],
};

Future<Iterable<String>> loadLedgerCategories() async {
  try {
    final response = await ApiClient.dio.get('/recipients/categories');
    final data = response.data;
    final saved = data is Map ? data['categories'] : null;
    if (saved is List) {
      return saved.whereType<String>().where((name) => name.trim().isNotEmpty);
    }
  } catch (_) {
    // The built-in categories are available offline and on older servers.
  }
  return const [];
}
