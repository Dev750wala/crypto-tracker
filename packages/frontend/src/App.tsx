import { useState } from 'react';
import { useSSE, EventData } from './hooks/useSSE';
import './App.css';

type EventType = 'Transfer' | 'Approval' | 'All';

function App() {
  const [eventType, setEventType] = useState<EventType | null>(null);

  const url = eventType ? `/api/consume?type=${eventType}` : null;
  const { events, status, error, isConnected, clearEvents } = useSSE(url);

  const handleTypeSelect = (type: EventType) => {
    if (eventType === type) {
      setEventType(null);
    } else {
      setEventType(type);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Crypto Event Tracker</h1>
        <p className="subtitle">Real-time blockchain events via SSE</p>
      </header>

      <div className="controls">
        <div className="button-group">
          {(['Transfer', 'Approval', 'All'] as EventType[]).map((type) => (
            <button
              key={type}
              className={`btn ${eventType === type ? 'active' : ''}`}
              onClick={() => handleTypeSelect(type)}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="status">
          <span className={`dot ${isConnected ? 'connected' : ''}`} />
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>

        {events.length > 0 && (
          <button className="btn btn-secondary" onClick={clearEvents}>
            Clear ({events.length})
          </button>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {status && <div className="status-message">{status}</div>}

      <div className="events-container">
        {events.length === 0 && !status ? (
          <div className="empty-state">
            {eventType
              ? 'Waiting for events...'
              : 'Select an event type to start listening'}
          </div>
        ) : events.length === 0 ? null : (
          events.map((event, index) => (
            <EventCard key={`${event.transactionHash}-${index}`} event={event} />
          ))
        )}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: EventData }) {
  const isTransfer = event.eventName === 'Transfer';

  return (
    <div className={`event-card ${isTransfer ? 'transfer' : 'approval'}`}>
      <div className="event-header">
        <span className={`event-badge ${isTransfer ? 'transfer' : 'approval'}`}>
          {event.eventName}
        </span>
        <span className="block-number">Block #{event.blockNumber}</span>
      </div>

      <div className="event-details">
        {isTransfer ? (
          <>
            <div className="detail-row">
              <span className="label">From:</span>
              <span className="value">{formatAddress(event.args[0])}</span>
            </div>
            <div className="detail-row">
              <span className="label">To:</span>
              <span className="value">{formatAddress(event.args[1])}</span>
            </div>
            <div className="detail-row">
              <span className="label">Value:</span>
              <span className="value">{formatValue(event.args[2])}</span>
            </div>
          </>
        ) : (
          <>
            <div className="detail-row">
              <span className="label">Owner:</span>
              <span className="value">{formatAddress(event.args[0])}</span>
            </div>
            <div className="detail-row">
              <span className="label">Spender:</span>
              <span className="value">{formatAddress(event.args[1])}</span>
            </div>
            <div className="detail-row">
              <span className="label">Value:</span>
              <span className="value">{formatValue(event.args[2])}</span>
            </div>
          </>
        )}
      </div>

      <div className="tx-hash">
        <a
          href={`https://sepolia.etherscan.io/tx/${event.transactionHash}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {formatAddress(event.transactionHash)}
        </a>
      </div>
    </div>
  );
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatValue(value: string): string {
  const num = BigInt(value);
  const decimals = 6; // USDC has 6 decimals
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const fraction = num % divisor;
  return `${whole.toLocaleString()}.${fraction.toString().padStart(decimals, '0')} USDC`;
}

export default App;
