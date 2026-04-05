import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';

export interface CreatorLogo {
  id: string;
  imageUrl: string;
  sortOrder: number;
  likes: number;
  dislikes: number;
  userVote: number | null;
}

const FALLBACK_LOGOS: CreatorLogo[] = [
  {
    id: 'fallback-1',
    imageUrl:
      'https://res.cloudinary.com/dxzcutnlp/image/upload/v1775357201/Disen%CC%83o_sin_ti%CC%81tulo_fgumjh.png',
    sortOrder: 0,
    likes: 0,
    dislikes: 0,
    userVote: null,
  },
  {
    id: 'fallback-2',
    imageUrl:
      'https://res.cloudinary.com/dxzcutnlp/image/upload/v1775340998/3_r97kll.png',
    sortOrder: 1,
    likes: 0,
    dislikes: 0,
    userVote: null,
  },
  {
    id: 'fallback-3',
    imageUrl:
      'https://res.cloudinary.com/dxzcutnlp/image/upload/v1775340998/4_zvaaqc.png',
    sortOrder: 2,
    likes: 0,
    dislikes: 0,
    userVote: null,
  },
  {
    id: 'fallback-4',
    imageUrl:
      'https://res.cloudinary.com/dxzcutnlp/image/upload/v1775340998/2_gl1k9h.png',
    sortOrder: 3,
    likes: 0,
    dislikes: 0,
    userVote: null,
  },
];

async function fetchLogos(): Promise<CreatorLogo[]> {
  const res = await apiClient.get(API_ENDPOINTS.CREATOR_LOGOS.LIST);
  return res.data.data;
}

export function useCreatorLogos() {
  const { data, isLoading } = useQuery({
    queryKey: ['creator-logos'],
    queryFn: fetchLogos,
    staleTime: 5 * 60 * 1000,
    placeholderData: FALLBACK_LOGOS,
  });

  return {
    logos: data ?? FALLBACK_LOGOS,
    isLoading,
  };
}
