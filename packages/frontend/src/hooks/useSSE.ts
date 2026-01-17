import { useEffect, useState, useCallback } from 'react';

export interface EventData {
  eventName: 'Transfer' | 'Approval';
  blockNumber: number;
  transactionHash: string;
  args: string[];
}

interface UseSSEReturn {
  events: EventData[];
  status: string | null;
  error: string | null;
  isConnected: boolean;
  clearEvents: () => void;
}

export function useSSE(url: string | null): UseSSEReturn {
  const [events, setEvents] = useState<EventData[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  useEffect(() => {
    if (!url) {
      setIsConnected(false);
      setStatus(null);
      return;
    }

    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      setStatus('Connecting...');
    };

    eventSource.onmessage = (event) => {
      const data = event.data;

      console.log(data);
      
      
      try {
        const parsed = JSON.parse(data);
        if (parsed.eventName) {
          setStatus(null);
          setEvents((prev) => [parsed, ...prev].slice(0, 100));
        }
      } catch {
        setStatus(data);
      }
    };

    eventSource.onerror = () => {
      setError('Connection lost. Trying to reconnect...');
      setIsConnected(false);
      setStatus(null);
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
      setStatus(null);
    };
  }, [url]);

  return { events, status, error, isConnected, clearEvents };
}
