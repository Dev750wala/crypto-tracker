import { useEffect, useState, useCallback } from 'react';

export interface EventData {
  eventName: 'Transfer' | 'Approval';
  blockNumber: number;
  transactionHash: string;
  args: string[];
}

interface UseSSEReturn {
  events: EventData[];
  error: string | null;
  isConnected: boolean;
  clearEvents: () => void;
}

export function useSSE(url: string | null): UseSSEReturn {
  const [events, setEvents] = useState<EventData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  useEffect(() => {
    if (!url) {
      setIsConnected(false);
      return;
    }

    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      const newData: EventData = JSON.parse(event.data);
      setEvents((prev) => [newData, ...prev].slice(0, 100));
    };

    eventSource.onerror = () => {
      setError('Connection lost. Trying to reconnect...');
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [url]);

  return { events, error, isConnected, clearEvents };
}
