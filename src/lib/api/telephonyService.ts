import { Platform } from 'react-native';
import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';
import type { CallRecord, AudioSegment } from '@/types/call';

interface VoiceTokenResponse {
  token: string;
  identity: string;
}

interface StreamStartResponse {
  streamSid: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export const telephonyService = {
  async getVoiceToken(): Promise<VoiceTokenResponse> {
    const { data } = await apiClient.get<VoiceTokenResponse>(
      API_ENDPOINTS.TELEPHONY.VOICE_TOKEN,
      { params: { platform: Platform.OS } }
    );
    return data;
  },

  async getCalls(): Promise<CallRecord[]> {
    const { data } = await apiClient.get<ApiResponse<CallRecord[]>>(
      API_ENDPOINTS.TELEPHONY.CALLS
    );
    return data.data;
  },

  async getCall(callSid: string): Promise<CallRecord> {
    const { data } = await apiClient.get<ApiResponse<CallRecord>>(
      API_ENDPOINTS.TELEPHONY.CALL(callSid)
    );
    return data.data;
  },

  async startCapture(callSid: string): Promise<StreamStartResponse> {
    const { data } = await apiClient.post<ApiResponse<StreamStartResponse>>(
      API_ENDPOINTS.TELEPHONY.STREAM_START(callSid)
    );
    return data.data;
  },

  async stopCapture(callSid: string, streamSid: string): Promise<void> {
    await apiClient.post(API_ENDPOINTS.TELEPHONY.STREAM_STOP(callSid), {
      streamSid,
    });
  },

  async getSegments(
    callSid: string
  ): Promise<(AudioSegment & { downloadUrl: string })[]> {
    const { data } = await apiClient.get<
      ApiResponse<(AudioSegment & { downloadUrl: string })[]>
    >(API_ENDPOINTS.TELEPHONY.SEGMENTS(callSid));
    return data.data;
  },
};
