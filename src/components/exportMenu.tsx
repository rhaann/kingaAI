import React, { useState } from 'react';
import { ChevronDown, FileText, Download, Mail, Loader2 } from 'lucide-react';
import { Artifact } from '@/types/types';

export type ExportFormat = 'pdf' | 'markdown' | 'text' | 'email';
type ArtifactLike = Artifact & { content?: string };

interface ExportMenuProps {
  artifact: ArtifactLike;
  onExport: (format: ExportFormat, artifact: ArtifactLike) => void;
}

interface ExportOption {
  format: ExportFormat;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    format: 'pdf',
    label: 'Export as PDF',
    description: 'Professional document format',
    icon: FileText
  },
  {
    format: 'text',
    label: 'Export as Text',
    description: 'Plain text file',
    icon: Download
  },
  {
    format: 'email',
    label: 'Copy for Email',
    description: 'Copy formatted for email',
    icon: Mail
  }
];

export const ExportMenu: React.FC<ExportMenuProps> = ({ artifact, onExport }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setIsExporting(format);
    try {
      onExport(format, artifact);
      setIsOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={!!isExporting}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
      >
        {isExporting ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Download className="w-3 h-3" />
        )}
        <span>{isExporting ? 'Saving...' : 'Export'}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-20">
            <div className="p-2">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2">
                Export Options
              </div>

              {EXPORT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isCurrentlyExporting = isExporting === option.format;

                return (
                  <button
                    key={option.format}
                    onClick={() => handleExport(option.format)}
                    disabled={!!isExporting}
                    className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left group disabled:opacity-50"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-100">
                      {isCurrentlyExporting ? (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      ) : (
                        <Icon className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm">{option.label}</div>
                      <div className="text-gray-500 text-xs">{option.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
