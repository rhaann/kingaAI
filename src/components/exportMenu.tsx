import React, { useState } from 'react';
import { ChevronDown, FileText, Download, Mail, Cloud, Loader2, ExternalLink, Check } from 'lucide-react';
import { Artifact } from '@/types/types';
import { useGoogleDrive } from '@/context/googleDriveContext';

export type ExportFormat = 'pdf' | 'word' | 'markdown' | 'text' | 'email' | 'google-drive';

interface ExportMenuProps {
  artifact: Artifact;
  onExport: (format: ExportFormat, artifact: Artifact) => void;
}

interface ExportOption {
  format: ExportFormat;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresGoogleDrive?: boolean;
}

const EXPORT_OPTIONS: ExportOption[] = [
  // {
  //   format: 'google-drive',
  //   label: 'Save to Google Drive',
  //   description: 'Save to Kinga Documents folder',
  //   icon: Cloud,
  //   requiresGoogleDrive: true
  // },
  {
    format: 'pdf',
    label: 'Export as PDF',
    description: 'Professional document format',
    icon: FileText
  },
  // {
  //   format: 'word',
  //   label: 'Export as Word',
  //   description: 'Editable document format',
  //   icon: FileText
  // },

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
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const { isConnected, connect, saveDocument } = useGoogleDrive();

  const handleExport = async (format: ExportFormat) => {
    setIsExporting(format);
    
    try {
      if (format === 'google-drive') {
        if (!isConnected) {
          // Auto-connect if not connected
          const connected = await connect();
          if (!connected) {
            setIsExporting(null);
            return;
          }
        }
        
        // Save to Google Drive and get shareable URL
        const shareableUrl = await saveDocument(artifact.title, artifact.content);
        setDriveUrl(shareableUrl);
        
        // Show success state briefly, then close
        setTimeout(() => {
          setIsOpen(false);
          setDriveUrl(null);
        }, 3000);
      } else {
        // Handle other export formats
        onExport(format, artifact);
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Export failed:', error);
      // Could add error toast here
    } finally {
      if (format !== 'google-drive') {
        setIsExporting(null);
      }
    }
  };

  const copyDriveUrl = () => {
    if (driveUrl) {
      navigator.clipboard.writeText(driveUrl);
    }
  };

  const openInDrive = () => {
    if (driveUrl) {
      window.open(driveUrl, '_blank');
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
                const isGoogleDrive = option.format === 'google-drive';
                const needsConnection = isGoogleDrive && !isConnected;
                const isCurrentlyExporting = isExporting === option.format;
                const hasSucceeded = isGoogleDrive && driveUrl && isCurrentlyExporting;
                
                return (
                  <button
                    key={option.format}
                    onClick={() => handleExport(option.format)}
                    disabled={!!isExporting}
                    className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left group disabled:opacity-50"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      hasSucceeded
                        ? 'bg-green-100'
                        : needsConnection 
                          ? 'bg-yellow-100' 
                          : isGoogleDrive 
                            ? 'bg-green-100' 
                            : 'bg-blue-100'
                    }`}>
                      {isCurrentlyExporting ? (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      ) : hasSucceeded ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Icon className={`w-4 h-4 ${
                          needsConnection 
                            ? 'text-yellow-600' 
                            : isGoogleDrive 
                              ? 'text-green-600' 
                              : 'text-blue-600'
                        }`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm">
                        {hasSucceeded ? 'Saved to Drive!' : option.label}
                        {needsConnection && (
                          <span className="ml-2 text-xs text-yellow-600">(Will connect)</span>
                        )}
                      </div>
                      <div className="text-gray-500 text-xs">
                        {hasSucceeded ? 'Document saved successfully' : option.description}
                      </div>
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