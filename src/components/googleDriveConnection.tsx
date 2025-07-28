import React from 'react';
import { useGoogleDrive } from '@/context/googleDriveContext';
import { useAuth } from '@/context/authContext'; 
import { Cloud, Loader2 } from 'lucide-react';

export const GoogleDriveConnection: React.FC = () => {
  const { isConnected, isConnecting, connect } = useGoogleDrive();
  const { user } = useAuth(); // <-- 2. Get the current user

  // If the user is not logged in, don't show the button at all.
  if (!user) {
    return null;
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-600/20 text-green-400 rounded-lg">
        <Cloud className="w-4 h-4" />
        <span className="text-sm">Drive Connected</span>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      // 3. Disable if connecting OR if there's no user
      disabled={isConnecting || !user} 
      className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
    >
      {isConnecting ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Cloud className="w-4 h-4" />
      )}
      <span className="text-sm">
        {isConnecting ? 'Connecting...' : 'Connect Google Drive'}
      </span>
    </button>
  );
};