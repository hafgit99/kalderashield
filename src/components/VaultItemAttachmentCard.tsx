import { Download, File } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { formatFileSize } from '../lib/display';
import type { VaultAttachmentMeta, VaultItem } from '../types';

interface VaultItemAttachmentCardProps {
  item: VaultItem;
  onDownload: (id: string, name: string) => void;
}

export default function VaultItemAttachmentCard({ item, onDownload }: VaultItemAttachmentCardProps) {
  const { t } = useLanguage();

  const attachmentList: VaultAttachmentMeta[] = [];
  const seen = new Set<string>();
  if (item.attachmentId) {
    seen.add(item.attachmentId);
    attachmentList.push({
      id: item.attachmentId,
      name: item.attachmentName || t('vaultForm.attachment.fallbackName'),
      size: item.attachmentSize || 0,
      type: item.attachmentType || 'application/octet-stream',
    });
  }
  for (const att of item.attachments ?? []) {
    if (att.id && !seen.has(att.id)) {
      seen.add(att.id);
      attachmentList.push(att);
    }
  }

  if (attachmentList.length === 0) return null;

  return (
    <div data-testid="vault-item-attachment-card" className="glass-panel p-5 rounded-xl border border-brand-primary/15 space-y-3.5 text-left">
      <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
        <h4 className="text-[10px] font-bold text-brand-primary tracking-widest uppercase flex items-center gap-2">
          <File className="w-4 h-4 text-brand-primary" />
          <span>{t('attachmentCard.title')}</span>
        </h4>
        <span className="text-[9px] text-brand-tertiary font-bold bg-brand-tertiary/10 px-2.5 py-0.5 rounded border border-brand-tertiary/20 font-mono">
          AES-GCM SECURE
        </span>
      </div>

      <div className="space-y-2">
        {attachmentList.map((att, idx) => (
          <div
            key={att.id}
            className="flex items-center justify-between p-3.5 bg-surface-lowest rounded-xl border border-outline-variant/15 hover:border-brand-primary/25 transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary shrink-0 border border-brand-primary/15">
                <File className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <p
                  data-testid={idx === 0 ? 'vault-item-attachment-name' : undefined}
                  className="font-bold text-xs text-on-surface truncate pr-2"
                >
                  {att.name}
                </p>
                <p className="text-[10px] text-on-surface-variant font-mono mt-0.5 font-bold">
                  <span>{formatFileSize(att.size || 0)}</span>
                  <span className="text-brand-tertiary ml-2">{t('attachmentCard.decryptOnDownload')}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid={idx === 0 ? 'vault-item-attachment-download-button' : undefined}
              onClick={() => onDownload(att.id, att.name)}
              className="p-2.5 bg-brand-primary text-brand-on-primary rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-md shadow-brand-primary/10 flex items-center justify-center shrink-0 cursor-pointer"
              title={t('attachmentCard.download')}
            >
              <Download className="w-4.5 h-4.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
