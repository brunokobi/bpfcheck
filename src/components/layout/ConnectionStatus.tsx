import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ConnectionStatus as StatusType } from '@/hooks/useOnlineStatus';

interface ConnectionStatusProps {
  status: StatusType;
  pendingCount?: number;
}

export const ConnectionStatus = ({ status, pendingCount = 0 }: ConnectionStatusProps) => {
  if (status === 'online' && pendingCount === 0) {
    return (
      <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-xs gap-1">
        <Wifi className="w-3 h-3" />
        Online
      </Badge>
    );
  }

  if (status === 'syncing') {
    return (
      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs gap-1 animate-pulse">
        <Loader2 className="w-3 h-3 animate-spin" />
        Sincronizando...
      </Badge>
    );
  }

  if (status === 'offline') {
    return (
      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-xs gap-1">
        <WifiOff className="w-3 h-3" />
        Offline
        {pendingCount > 0 && (
          <span className="ml-1 bg-warning/20 px-1.5 rounded-full">{pendingCount}</span>
        )}
      </Badge>
    );
  }

  // Online with pending items
  return (
    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs gap-1">
      <Wifi className="w-3 h-3" />
      Online
      {pendingCount > 0 && (
        <span className="ml-1 bg-primary/20 px-1.5 rounded-full">{pendingCount}</span>
      )}
    </Badge>
  );
};
