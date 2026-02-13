import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { nodeAPI, commandAPI, type Node, type Command, type Telemetry } from '../../services/api';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export default function NodeDetail() {
  const router = useRouter();
  const { id } = router.query;
  
  const [node, setNode] = useState<Node | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState('ping');

  const fetchData = async () => {
    if (!id || typeof id !== 'string') return;
    
    try {
      const [nodeData, telemetryData, commandData] = await Promise.all([
        nodeAPI.get(id),
        nodeAPI.getTelemetry(id, 20),
        commandAPI.getHistory(id, 20),
      ]);
      
      setNode(nodeData);
      setTelemetry(telemetryData);
      setCommands(commandData);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [id]);

  const executeCommand = async () => {
    if (!id || typeof id !== 'string') return;
    
    setExecuting(true);
    try {
      await commandAPI.execute(id, selectedCommand);
      setTimeout(fetchData, 500); // Refresh data after command
    } catch (err) {
      console.error('Error executing command:', err);
    } finally {
      setExecuting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'text-green-400 bg-green-500/20 border-green-500/50';
      case 'CONNECTING': case 'BOOTING': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
      case 'DEGRADED': return 'text-orange-400 bg-orange-500/20 border-orange-500/50';
      case 'OFFLINE': return 'text-red-400 bg-red-500/20 border-red-500/50';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="glass rounded-xl p-12 text-center">
        <h2 className="text-2xl font-bold mb-2">Node not found</h2>
        <Link href="/" className="text-cyan-400 hover:underline">← Back to nodes</Link>
      </div>
    );
  }

  const latestTelemetry = telemetry[0];

  return (
    <div>
      <Link href="/" className="inline-flex items-center text-cyan-400 hover:underline mb-6">
        ← Back to nodes
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Node Info */}
        <div className="lg:col-span-2 glass rounded-xl p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">{node.name || node.id}</h1>
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${getStatusColor(node.status)}`}>
                <div className="w-2 h-2 rounded-full bg-current animate-pulse"></div>
                <span className="text-sm font-medium">{node.status}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-400 mb-1">Hostname</p>
              <p className="font-medium">{node.hostname}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">IP Address</p>
              <p className="font-medium">{node.ip_address || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Hardware ID</p>
              <p className="font-mono text-sm">{node.hardware_id.substring(0, 16)}...</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Last Heartbeat</p>
              <p className="text-sm">
                {node.last_heartbeat 
                  ? formatDistanceToNow(new Date(node.last_heartbeat), { addSuffix: true })
                  : 'Never'}
              </p>
            </div>
          </div>
        </div>

        {/* System Metrics */}
        <div className="glass rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4">System Metrics</h2>
          {latestTelemetry ? (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">CPU</span>
                  <span className="font-medium">{latestTelemetry.cpu_percent}%</span>
                </div>
                <div className="w-full bg-dark-700 rounded-full h-2">
                  <div 
                    className="bg-cyan-500 h-2 rounded-full transition-all"
                    style={{ width: `${latestTelemetry.cpu_percent}%` }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Memory</span>
                  <span className="font-medium">{latestTelemetry.memory_percent}%</span>
                </div>
                <div className="w-full bg-dark-700 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${latestTelemetry.memory_percent}%` }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Disk</span>
                  <span className="font-medium">{latestTelemetry.disk_percent}%</span>
                </div>
                <div className="w-full bg-dark-700 rounded-full h-2">
                  <div 
                    className="bg-purple-500 h-2 rounded-full transition-all"
                    style={{ width: `${latestTelemetry.disk_percent}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No telemetry data available</p>
          )}
        </div>
      </div>

      {/* Command Execution */}
      <div className="glass rounded-xl p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Execute Command</h2>
        <div className="flex gap-4">
          <select
            value={selectedCommand}
            onChange={(e) => setSelectedCommand(e.target.value)}
            className="flex-1 glass rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="ping">Ping</option>
            <option value="system_info">System Info</option>
            <option value="restart_agent">Restart Agent</option>
            <option value="custom_task">Custom Task</option>
          </select>
          <button
            onClick={executeCommand}
            disabled={executing || node.status !== 'ACTIVE'}
            className="glass glass-hover px-8 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {executing ? 'Executing...' : 'Execute'}
          </button>
        </div>
      </div>

      {/* Command History */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold mb-4">Command History</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {commands.map((cmd) => (
            <div key={cmd.command_id} className="glass rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{cmd.command_type}</span>
                <span className={`text-sm px-2 py-1 rounded ${
                  cmd.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                  cmd.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {cmd.status}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(cmd.created_at), { addSuffix: true })}
              </p>
            </div>
          ))}
          {commands.length === 0 && (
            <p className="text-gray-400 text-center py-8">No commands executed yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
