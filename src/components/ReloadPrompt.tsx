import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // If we want to check for updates periodically, we could set an interval here
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl p-4 max-w-sm flex flex-col gap-3">
        <div className="flex flex-col">
          <h3 className="font-black text-sm text-zinc-900 dark:text-white">New Update Available</h3>
          <p className="text-xs font-medium text-zinc-500 mt-1">
            A new version of MyBoma is ready. Update now to get the latest features and bug fixes.
          </p>
        </div>
        <div className="flex gap-2 justify-end">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setNeedRefresh(false)}
            className="text-xs font-bold rounded-xl h-8"
          >
            Dismiss
          </Button>
          <Button 
            size="sm" 
            onClick={() => updateServiceWorker(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl h-8 px-4"
          >
            Update Now
          </Button>
        </div>
      </div>
    </div>
  );
}
