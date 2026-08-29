import * as FileSystem from 'expo-file-system/legacy';

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

  /**
   * Attach a segment to a project. The backend auto-creates the timeline clip.
   *
   * `positionInTimeline` (ms) tells the backend WHERE to place that clip. In-call
   * recording sends the playhead the take was performed over, because the backend
   * otherwise appends after the last clip on the lane — which made a recording sung
   * over an imported track appear detached at the end of the timeline (David,
   * Aug 2). Older backends ignore the field (validation strips unknown keys), so
   * sending it is safe before the backend deploy lands.
   */
  async addSegment(
    projectId: string,
    segmentId: string,
    laneIndex?: number,
    positionInTimeline?: number
  ): Promise<AudioSegment> {
    const body: Record<string, unknown> = { segmentId };
    if (laneIndex !== undefined) body.laneIndex = laneIndex;
    if (positionInTimeline !== undefined && positionInTimeline >= 0) {
      body.positionInTimeline = Math.round(positionInTimeline);
    }
    const { data } = await apiClient.post<ApiResponse<AudioSegment>>(
      API_ENDPOINTS.PROJECTS.ADD_SEGMENT(projectId),
      body
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

  /**
   * Upload an audio file into a project lane, reporting REAL byte progress.
   *
   * Why not `fetch`: React Native's fetch is the whatwg-fetch polyfill and exposes
   * no upload progress at all, which is why the import modal could only ever show
   * an indeterminate spinner while a 27 MB file took 49 seconds (measured, David
   * Aug 2). It also assembles the whole multipart body in memory on iOS.
   *
   * Why the LEGACY FileSystem API: on Expo SDK 55 the new `expo-file-system` upload
   * API has no progress support at all (uploadAsync/createUploadTask are stubs that
   * throw); progress only returns in expo-file-system 56, and Expo packages are
   * SDK-pinned. `expo-file-system/legacy` `createUploadTask` is the only API on this
   * SDK that can report bytes, and the app already imports that path elsewhere.
   *
   * Two non-obvious requirements, both load-bearing:
   *  - `fieldName: 'file'` MUST be explicit; legacy defaults it to the filename and
   *    the backend's FileInterceptor('file') would then never see the upload.
   *  - `sessionType: FOREGROUND`; legacy defaults to BACKGROUND, which routes
   *    through nsurlsessiond and is measurably slower even while foregrounded.
   */
  async uploadAudio(
    projectId: string,
    fileUri: string,
    fileName: string,
    mimeType: string,
    laneIndex: number,
    signal?: AbortSignal,
    onProgress?: (p: { bytesSent: number; totalBytes: number }) => void,
    /**
     * Where on the timeline the created clip belongs, in ms. An in-call take
     * belongs at the playhead it was performed over; without it the backend
     * appends after the last clip on the lane. Older backends ignore the field.
     */
    positionInTimeline?: number,
    /**
     * createClip=false stores the audio as a SEGMENT ONLY (no clip on the lane).
     * The non-destructive effects flow needs that: it renders an effected copy
     * of a clip's audio and points the EXISTING clip at it. Older backends
     * ignore the field and still create a clip; callers guard on the response.
     */
    options?: { createClip?: boolean }
  ): Promise<TimelineClip> {
    const token = await (await import('@/lib/auth/storage')).authStorage.getToken();
    const baseUrl = apiClient.defaults.baseURL ?? '';
    const url = `${baseUrl}${API_ENDPOINTS.PROJECTS.UPLOAD_AUDIO(projectId)}`;

    // Multipart parameters are strings on the wire; the backend parses them.
    const parameters: Record<string, string> = { laneIndex: String(laneIndex) };
    if (positionInTimeline !== undefined && positionInTimeline >= 0) {
      parameters.positionInTimeline = String(Math.round(positionInTimeline));
    }
    if (options?.createClip === false) parameters.createClip = 'false';

    const task = FileSystem.createUploadTask(
      url,
      fileUri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType,
        parameters,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
      },
      (raw) => {
        // Never divide by the file size: the multipart total includes boundary and
        // header framing, so file-size math can exceed 100%.
        onProgress?.({
          bytesSent: raw.totalBytesSent,
          totalBytes: raw.totalBytesExpectedToSend,
        });
      }
    );

    // Cancel must actually stop the transfer, not just reject the promise.
    const onAbort = () => {
      void task.cancelAsync().catch(() => {});
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      const res = await task.uploadAsync();
      // uploadAsync can resolve null/undefined (expo/expo#36476) — treat as failure
      // rather than crashing on a property read of null.
      if (!res) {
        throw new Error(
          signal?.aborted ? 'Upload cancelled' : 'Upload failed with no response'
        );
      }
      if (res.status < 200 || res.status >= 300) {
        throw new Error(res.body || `Request failed with status code ${res.status}`);
      }
      const json: ApiResponse<TimelineClip> = JSON.parse(res.body);
      return json.data;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  },

  /**
   * Store an audio file as a project SEGMENT without creating a clip. Returns
   * the new segment (with its id) so the caller can point an existing clip at
   * it. Used by the effects flow; see `uploadAudio` for the transport details.
   */
  async uploadSegmentOnly(
    projectId: string,
    fileUri: string,
    fileName: string,
    mimeType: string
  ): Promise<AudioSegment> {
    const data = await projectService.uploadAudio(
      projectId,
      fileUri,
      fileName,
      mimeType,
      0,
      undefined,
      undefined,
      undefined,
      { createClip: false }
    );
    // With createClip=false the backend answers with the AudioSegment itself.
    // A pre-createClip backend answers with a clip: in that case the segment is
    // still reachable via clip.segmentId, but a stray clip was created — the
    // caller's next timeline save (which replaces all clips) drops it again.
    const seg = data as unknown as Partial<AudioSegment> & { segmentId?: string };
    if (typeof seg.durationMs === 'number' && !seg.segmentId) return seg as AudioSegment;
    return { id: seg.segmentId ?? '', durationMs: 0 } as unknown as AudioSegment;
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
