import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';
import type {
  Project,
  ProjectDetail,
  LaneMetadata,
  TimelineClip,
  TimelineClipInput,
  ExportResult,
} from '@/types/project';
import type { AudioSegment } from '@/types/call';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export const projectService = {
  async listProjects(): Promise<Project[]> {
    const { data } = await apiClient.get<ApiResponse<Project[]>>(
      API_ENDPOINTS.PROJECTS.LIST
    );
    return data.data;
  },

  async createProject(name: string, description?: string): Promise<Project> {
    const { data } = await apiClient.post<ApiResponse<Project>>(
      API_ENDPOINTS.PROJECTS.CREATE,
      { name, description }
    );
    return data.data;
  },

  async getProject(id: string): Promise<ProjectDetail> {
    const { data } = await apiClient.get<ApiResponse<ProjectDetail>>(
      API_ENDPOINTS.PROJECTS.DETAIL(id)
    );
    return data.data;
  },

  async updateProject(
    id: string,
    updates: {
      name?: string;
      description?: string;
      status?: string;
      lanes?: Record<string, LaneMetadata>;
    }
  ): Promise<Project> {
    const { data } = await apiClient.patch<ApiResponse<Project>>(
      API_ENDPOINTS.PROJECTS.UPDATE(id),
      updates
    );
    return data.data;
  },

  async deleteProject(id: string): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.PROJECTS.DELETE(id));
  },

  async addSegment(projectId: string, segmentId: string): Promise<AudioSegment> {
    const { data } = await apiClient.post<ApiResponse<AudioSegment>>(
      API_ENDPOINTS.PROJECTS.ADD_SEGMENT(projectId),
      { segmentId }
    );
    return data.data;
  },

  async removeSegment(projectId: string, segmentId: string): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.PROJECTS.REMOVE_SEGMENT(projectId, segmentId));
  },

  async getTimeline(projectId: string): Promise<TimelineClip[]> {
    const { data } = await apiClient.get<ApiResponse<TimelineClip[]>>(
      API_ENDPOINTS.PROJECTS.TIMELINE(projectId)
    );
    return data.data;
  },

  async saveTimeline(
    projectId: string,
    clips: TimelineClipInput[]
  ): Promise<TimelineClip[]> {
    const { data } = await apiClient.put<ApiResponse<TimelineClip[]>>(
      API_ENDPOINTS.PROJECTS.TIMELINE(projectId),
      { clips }
    );
    return data.data;
  },

  async exportProject(projectId: string): Promise<ExportResult> {
    const { data } = await apiClient.post<ApiResponse<ExportResult>>(
      API_ENDPOINTS.PROJECTS.EXPORT(projectId)
    );
    return data.data;
  },

  async uploadAudio(
    projectId: string,
    fileUri: string,
    fileName: string,
    mimeType: string,
    laneIndex: number
  ): Promise<TimelineClip> {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);
    formData.append('laneIndex', String(laneIndex));

    const { data } = await apiClient.post<ApiResponse<TimelineClip>>(
      API_ENDPOINTS.PROJECTS.UPLOAD_AUDIO(projectId),
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data.data;
  },

  async getWaveform(segmentId: string, samples = 100): Promise<number[]> {
    const { data } = await apiClient.get<ApiResponse<number[]>>(
      API_ENDPOINTS.PROJECTS.WAVEFORM(segmentId),
      { params: { samples } }
    );
    return data.data;
  },

  async getWaveformsBatch(
    segmentIds: string[],
    samples = 100
  ): Promise<Record<string, number[]>> {
    const { data } = await apiClient.post<ApiResponse<Record<string, number[]>>>(
      '/telephony/segments/waveforms/batch',
      { segmentIds, samples }
    );
    return data.data;
  },
};
