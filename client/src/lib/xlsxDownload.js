import writeXlsxFile from 'write-excel-file/browser';

export async function downloadXlsx(rows, fileName, sheetOptions) {
  const writer = sheetOptions ? writeXlsxFile(rows, sheetOptions) : writeXlsxFile(rows);

  if (writer?.toFile) {
    await writer.toFile(fileName);
    return;
  }

  await writeXlsxFile(rows, sheetOptions ? { ...sheetOptions, fileName } : { fileName });
}
