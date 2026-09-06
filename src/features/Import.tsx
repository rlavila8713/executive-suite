import { useEffect, useRef, useState } from 'react';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { Card, Button } from '../components/ui';
import { useI18n } from '../i18n/I18nContext';
import { downloadCsv } from '../lib/printDocument';
import {
  parseProductImportCsv,
  PRODUCT_IMPORT_TEMPLATE_HEADERS,
  PRODUCT_IMPORT_TEMPLATE_SAMPLE,
  type ProductImportRow,
} from '../lib/csvParse';
import { mapMutationError } from '../lib/mutationErrors';
import { api, type ProductImportResult, type ProductImportValidation } from '../api/client';
import { cn } from '../lib/utils';

interface ImportProps {
  onImport: (rows: ProductImportRow[]) => Promise<ProductImportResult>;
}

export function Import({ onImport }: ImportProps) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ProductImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ProductImportValidation | null>(null);
  const [validating, setValidating] = useState(false);

  const mapImportErrorCode = (code: string): string => {
    if (code.startsWith('ERR_DUPLICATE_SKU|')) {
      return t('import.errDuplicateSku', { sku: code.split('|')[1] });
    }
    if (code.startsWith('ERR_DUPLICATE_SKU_IN_FILE|')) {
      return t('import.errDuplicateSkuInFile', { sku: code.split('|')[1] });
    }
    if (code.startsWith('ERR_DUPLICATE_PRODUCT|')) {
      return t('import.errDuplicateProduct', { name: code.split('|')[1] });
    }
    if (code.startsWith('ERR_DUPLICATE_PRODUCT_IN_FILE|')) {
      return t('import.errDuplicateProductInFile', { name: code.split('|')[1] });
    }
    return code;
  };

  const mapParseError = (code: string): string => {
    if (code === 'EMPTY_FILE') return t('import.errEmptyFile');
    if (code === 'NO_DATA_ROWS') return t('import.errNoData');
    if (code.startsWith('MISSING_COLUMN|')) {
      const col = code.split('|')[1];
      return t('import.errMissingColumn', { col });
    }
    if (code.startsWith('ROW_MISSING_REQUIRED|')) {
      return t('import.errRowRequired', { row: code.split('|')[1] });
    }
    if (code.startsWith('ROW_INVALID_PRICE|')) {
      return t('import.errRowPrice', { row: code.split('|')[1] });
    }
    if (code.startsWith('ROW_INVALID_COST|')) {
      return t('import.errRowCost', { row: code.split('|')[1] });
    }
    if (code.startsWith('ROW_INVALID_STOCK|')) {
      return t('import.errRowStock', { row: code.split('|')[1] });
    }
    return code;
  };

  const handleFile = async (file: File) => {
    setParseError(null);
    setResult(null);
    setImportError(null);
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseProductImportCsv(text);
    if (!parsed.ok) {
      setRows([]);
      setParseError(mapParseError('error' in parsed ? parsed.error : 'EMPTY_FILE'));
      return;
    }
    setRows(parsed.rows);
  };

  useEffect(() => {
    if (rows.length === 0) {
      setValidation(null);
      return;
    }
    let cancelled = false;
    setValidating(true);
    void api
      .validateProductImport(rows)
      .then((v) => {
        if (!cancelled) setValidation(v);
      })
      .catch(() => {
        if (!cancelled) setValidation(null);
      })
      .finally(() => {
        if (!cancelled) setValidating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const handleImport = async () => {
    if (rows.length === 0) return;
    setBusy(true);
    setImportError(null);
    setResult(null);
    try {
      const res = await onImport(rows);
      setResult(res);
      if (res.errors.length === 0) {
        setRows([]);
        setFileName(null);
        if (fileRef.current) fileRef.current.value = '';
      }
    } catch (err) {
      setImportError(mapMutationError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">{t('import.title')}</h2>
        <p className="text-on-surface-variant text-sm font-medium">{t('import.subtitle')}</p>
      </div>

      <Card className="p-4 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="text-primary shrink-0 mt-0.5" size={22} />
          <div className="text-sm text-on-surface-variant space-y-2">
            <p>{t('import.formatNote')}</p>
            <p className="font-semibold text-primary">{t('import.requiredColumns')}</p>
            <ul className="list-disc pl-5 text-xs space-y-0.5">
              <li>{t('import.colName')}</li>
              <li>{t('import.colCategory')}</li>
              <li>{t('import.colSubcategory')}</li>
              <li>{t('import.colPrice')}</li>
              <li>{t('import.colCost')}</li>
              <li>{t('import.colStock')}</li>
            </ul>
            <p className="text-xs">{t('import.optionalColumns')}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="gap-2"
            onClick={() =>
              downloadCsv(
                'plantilla-importacion-productos.csv',
                [...PRODUCT_IMPORT_TEMPLATE_HEADERS],
                PRODUCT_IMPORT_TEMPLATE_SAMPLE,
              )
            }
          >
            <Download size={16} /> {t('import.downloadTemplate')}
          </Button>
          <Button variant="secondary" className="gap-2" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> {t('import.selectFile')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </div>

        {fileName ? (
          <p className="text-xs text-on-surface-variant">
            {t('import.fileSelected', { name: fileName, count: rows.length })}
          </p>
        ) : null}
        {parseError ? <p className="text-sm text-error font-medium">{parseError}</p> : null}
        {importError ? <p className="text-sm text-error font-medium">{importError}</p> : null}
      </Card>

      {rows.length > 0 ? (
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-black/5 bg-surface-container-low space-y-3">
            <div className="flex justify-between items-center gap-3">
              <p className="text-sm font-bold text-primary">{t('import.previewTitle', { count: rows.length })}</p>
              <Button
                disabled={busy || validating || (validation != null && validation.summary.new === 0)}
                onClick={() => void handleImport()}
              >
                {busy ? t('import.importing') : t('import.runImport')}
              </Button>
            </div>
            {validating ? (
              <p className="text-xs text-on-surface-variant">{t('import.validating')}</p>
            ) : validation ? (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-on-tertiary-container/15 text-on-tertiary-container px-2.5 py-1 font-semibold">
                  <CheckCircle2 size={14} />
                  {t('import.summaryNew', { count: validation.summary.new })}
                </span>
                {validation.summary.duplicateExisting > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-error/10 text-error px-2.5 py-1 font-semibold">
                    <AlertCircle size={14} />
                    {t('import.summaryDuplicateExisting', { count: validation.summary.duplicateExisting })}
                  </span>
                ) : null}
                {validation.summary.duplicateInFile > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200 px-2.5 py-1 font-semibold">
                    <AlertTriangle size={14} />
                    {t('import.summaryDuplicateInFile', { count: validation.summary.duplicateInFile })}
                  </span>
                ) : null}
              </div>
            ) : null}
            {validation && validation.summary.new === 0 ? (
              <p className="text-sm text-error font-medium">{t('import.errAllDuplicates')}</p>
            ) : validation && validation.summary.duplicateExisting + validation.summary.duplicateInFile > 0 ? (
              <p className="text-xs text-on-surface-variant">{t('import.duplicateHint')}</p>
            ) : null}
          </div>
          <div className="overflow-x-auto max-h-[24rem] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-container-low sticky top-0">
                <tr className="text-[10px] uppercase text-on-surface-variant">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">{t('import.colName')}</th>
                  <th className="px-4 py-2">{t('import.colCategory')}</th>
                  <th className="px-4 py-2">{t('import.colSubcategory')}</th>
                  <th className="px-4 py-2 text-right">{t('import.colPrice')}</th>
                  <th className="px-4 py-2 text-right">{t('import.colCost')}</th>
                  <th className="px-4 py-2 text-right">{t('import.colStock')}</th>
                  <th className="px-4 py-2">{t('import.colLocation')}</th>
                  <th className="px-4 py-2">{t('common.sku')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => {
                  const rowStatus = validation?.rows.find((v) => v.row === i + 2)?.status;
                  return (
                  <tr
                    key={`${r.sku ?? r.name}-${i}`}
                    className={cn(
                      'border-t border-black/5',
                      rowStatus === 'duplicate_existing' && 'bg-error/5',
                      rowStatus === 'duplicate_in_file' && 'bg-amber-500/10',
                    )}
                  >
                    <td className="px-4 py-2 text-on-surface-variant">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2">{r.category}</td>
                    <td className="px-4 py-2">{r.subcategory}</td>
                    <td className="px-4 py-2 text-right">${r.price.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">${r.cost.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">{r.stock}</td>
                    <td className="px-4 py-2 text-on-surface-variant">{r.location ?? '—'}</td>
                    <td className="px-4 py-2 text-on-surface-variant">{r.sku ?? t('import.skuAuto')}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 100 ? (
            <p className="p-3 text-xs text-on-surface-variant border-t border-black/5">
              {t('import.previewTruncated', { count: rows.length })}
            </p>
          ) : null}
        </Card>
      ) : null}

      {result ? (
        <Card className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            {result.errors.length === 0 ? (
              <CheckCircle2 className="text-on-tertiary-container" size={22} />
            ) : (
              <AlertCircle className="text-error" size={22} />
            )}
            <p className="font-bold text-primary">{t('import.resultTitle')}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg bg-surface-container-low p-3">
              <p className="text-[10px] uppercase font-bold text-on-surface-variant">{t('import.createdCategories')}</p>
              <p className="text-xl font-bold text-primary">{result.created.categories}</p>
            </div>
            <div className="rounded-lg bg-surface-container-low p-3">
              <p className="text-[10px] uppercase font-bold text-on-surface-variant">{t('import.createdSubcategories')}</p>
              <p className="text-xl font-bold text-primary">{result.created.subcategories}</p>
            </div>
            <div className="rounded-lg bg-surface-container-low p-3">
              <p className="text-[10px] uppercase font-bold text-on-surface-variant">{t('import.createdLocations')}</p>
              <p className="text-xl font-bold text-primary">{result.created.locations}</p>
            </div>
            <div className="rounded-lg bg-surface-container-low p-3">
              <p className="text-[10px] uppercase font-bold text-on-surface-variant">{t('import.createdProducts')}</p>
              <p className="text-xl font-bold text-primary">{result.created.products}</p>
            </div>
          </div>
          {result.errors.length > 0 ? (
            <div>
              <p className="text-sm font-bold text-error mb-2">{t('import.rowErrors', { count: result.errors.length })}</p>
              <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                {result.errors.map((e) => (
                  <li key={`${e.row}-${e.message}`} className="text-on-surface-variant">
                    {t('import.rowErrorLine', {
                      row: e.row,
                      message: e.message.startsWith('ERR_')
                        ? mapImportErrorCode(e.message)
                        : e.message,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-on-tertiary-container font-medium">{t('import.successAll')}</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
