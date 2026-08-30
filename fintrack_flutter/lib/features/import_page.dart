import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

class ImportPageWidget extends StatefulWidget {
  const ImportPageWidget({super.key});
  @override
  State<ImportPageWidget> createState() => _ImportPageWidgetState();
}

class _ImportPageWidgetState extends State<ImportPageWidget> {
  String? bankResult;
  String? shotResult;

  Future<void> pickBank() async {
    final res = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['csv','xlsx','xls'], withData: true);
    if(res==null || res.files.first.bytes==null) return;
    final f = res.files.first;
    final fd = FormData.fromMap({'file': MultipartFile.fromBytes(f.bytes!, filename: f.name)});
    final r = await ApiClient.dio.post('/imports/bank', data: fd);
    final status = r.data['status']?.toString() ?? '';
    if(status=='duplicate_file'){ setState(()=> bankResult = 'DUPLICATE: ${r.data['message']?.toString() ?? 'Already imported'}'); if(mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(r.data['message']?.toString() ?? 'Duplicate file'))); return; }
    setState(()=> bankResult = r.data.toString());
  }

  Future<void> pickScreenshot() async {
    final picker = ImagePicker();
    final x = await picker.pickImage(source: ImageSource.gallery);
    if(x==null) return;
    final bytes = await x.readAsBytes();
    final fd = FormData.fromMap({'file': MultipartFile.fromBytes(bytes, filename: x.name)});
    final r = await ApiClient.dio.post('/imports/screenshot', data: fd);
    if((r.data['status']?.toString() ?? '')=='duplicate_file'){ setState(()=> shotResult = 'DUPLICATE: ${r.data['message']?.toString() ?? ''}'); if(mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Duplicate screenshot'))); return; }
    setState(()=> shotResult = r.data.toString());
  }

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('BANK STATEMENT', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
        const Text('Upload CSV or Excel (.xlsx). Re-uploads are deduplicated.', style: TextStyle(fontSize: 12, color: Color(0xFF4B4731))),
        const SizedBox(height: 8),
        BrutalButton(label: 'Pick File', icon: Icons.upload_file, onPressed: pickBank),
        if(bankResult!=null) ...[const SizedBox(height: 8), Text(bankResult!, style: const TextStyle(fontSize: 11))],
      ])),
      const SizedBox(height: 12),
      BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('UPI SCREENSHOT', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
        const Text('Gemini extracts amount/date/UPI from the image.', style: TextStyle(fontSize: 12, color: Color(0xFF4B4731))),
        const SizedBox(height: 8),
        BrutalButton(label: 'Pick Image', icon: Icons.image, onPressed: pickScreenshot),
        if(shotResult!=null) ...[const SizedBox(height: 8), Text(shotResult!, style: const TextStyle(fontSize: 11))],
      ])),
    ]);
  }
}
