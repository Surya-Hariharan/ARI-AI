import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface Node {
  id: string;
  name: string | null;
  status: 'BOOTING' | 'CONNECTING' | 'ACTIVE' | 'DEGRADED' | 'OFFLINE';
  hardware_id: string;
  hostname: string;
  ip_address: string | null;
  last_heartbeat: string | null;
  last_seen: string | null;
  created_at: string;
  metadata: Record<string, any>;
}

export interface Command {
  command_id: string;
  node_id: string;
  command_type: string;
  status: string;
  result: any;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  completed_at: string | null;
}

export interface Telemetry {
  id: number;
  node_id: string;
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  data: Record<string, any>;
  timestamp: string;
}

// Node API
export const nodeAPI = {
  async list(): Promise<Node[]> {
    const response = await api.get('/api/v1/nodes/');
    return response.data;
  },

  async get(nodeId: string): Promise<Node> {
    const response = await api.get(`/api/v1/nodes/${nodeId}`);
    return response.data;
  },

  async delete(nodeId: string): Promise<void> {
    await api.delete(`/api/v1/nodes/${nodeId}`);
  },

  async getTelemetry(nodeId: string, limit: number = 100): Promise<Telemetry[]> {
    const response = await api.get(`/api/v1/nodes/${nodeId}/telemetry?limit=${limit}`);
    return response.data;
  },
};

// Command API
export const commandAPI = {
  async execute(nodeId: string, commandType: string, payload: Record<string, any> = {}): Promise<Command> {
    const response = await api.post('/api/v1/commands/execute', {
      node_id: nodeId,
      command_type: commandType,
      payload,
    });
    return response.data;
  },

  async getStatus(commandId: string): Promise<Command> {
    const response = await api.get(`/api/v1/commands/${commandId}`);
    return response.data;
  },

  async getHistory(nodeId: string, limit: number = 50): Promise<Command[]> {
    const response = await api.get(`/api/v1/commands/node/${nodeId}/history?limit=${limit}`);
    return response.data;
  },
};

// Health API
export const healthAPI = {
  async check() {
    const response = await api.get('/health');
    return response.data;
  },
};

export default api;
