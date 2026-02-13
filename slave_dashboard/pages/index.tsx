import { useEffect, useState } from 'react';
import { nodeAPI, type Node } from '../services/api';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = async () => {
    try {
      setLoading(true);
      const data = await nodeAPI.list();
      setNodes(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNodes();
    const interval = setInterval(fetchNodes, 5000); // Auto-refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-500';
      case 'CONNECTING':
      case 'BOOTING':
        return 'bg-yellow-500';
      case 'DEGRADED':
        return 'bg-orange-500';
      case 'OFFLINE':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = (node: Node) => {
    if (node.last_heartbeat) {
      const time = formatDistanceToNow(new Date(node.last_heartbeat), { addSuffix: true });
      return `Last heartbeat ${time}`;
    }
    return 'No heartbeat';
  };

  if (loading && nodes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading nodes...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
            Slave Nodes
          </h1>
          <p className="text-gray-400">
            {nodes.length} node{nodes.length !== 1 ? 's' : ''} • {nodes.filter(n => n.status === 'ACTIVE').length} active
          </p>
        </div>
        <button
          onClick={fetchNodes}
          className="glass glass-hover px-6 py-3 rounded-lg font-medium"
        >
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="glass border-red-500/50 bg-red-500/10 p-4 rounded-lg mb-6">
          <p className="text-red-400">Error: {error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {nodes.map((node) => (
          <Link
            key={node.id}
            href={`/nodes/${node.id}`}
            className="glass glass-hover rounded-xl p-6 group"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(node.status)} animate-pulse`}></div>
                  <span className="text-sm font-medium text-gray-400">{node.status}</span>
                </div>
                <h3 className="text-xl font-bold group-hover:text-cyan-400 transition-colors">
                  {node.name || node.id.substring(0, 8)}
                </h3>
              </div>
              <div className="text-2xl">💻</div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Hostname</span>
                <span className="font-medium">{node.hostname}</span>
              </div>
              
              {node.ip_address && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">IP Address</span>
                  <span className="font-medium">{node.ip_address}</span>
                </div>
              )}
              
              <div className="pt-2 border-t border-white/10">
                <p className="text-xs text-gray-500">{getStatusText(node)}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {nodes.length === 0 && !loading && (
        <div className="glass rounded-xl p-12 text-center">
          <div className="text-6xl mb-4">📡</div>
          <h2 className="text-2xl font-bold mb-2">No nodes registered</h2>
          <p className="text-gray-400">Start a slave agent to see it appear here</p>
        </div>
      )}
    </div>
  );
}
