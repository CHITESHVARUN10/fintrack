import 'package:flutter/material.dart';
import '../theme/finstack_theme.dart';

class BrutalCard extends StatelessWidget {
  final Widget child;
  final Color color;
  final EdgeInsets padding;
  const BrutalCard({super.key, required this.child, this.color = Colors.white, this.padding = const EdgeInsets.all(16)});
  @override
  Widget build(BuildContext context) => Container(decoration: brutal(color: color), padding: padding, child: child);
}

class BrutalButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  const BrutalButton({super.key, required this.label, this.onPressed, this.icon});
  @override
  Widget build(BuildContext context) => ElevatedButton.icon(onPressed: onPressed, icon: icon!=null? Icon(icon): const SizedBox.shrink(), label: Text(label.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w700)));
}

class BrutalField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? hint;
  final bool obscure;
  const BrutalField({super.key, required this.label, required this.controller, this.hint, this.obscure=false});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(label.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)), const SizedBox(height: 6), TextField(controller: controller, obscureText: obscure, decoration: InputDecoration(hintText: hint))]);
}
