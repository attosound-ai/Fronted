import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export interface CropRegion {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * imageCropService — SRP: wraps expo-image-manipulator for crop + resize operations.
 */
export const imageCropService = {
  /**
   * Crop a region from an image and resize to a square output.
   *
   * @param uri        - Local file URI of the source image
   * @param region     - Crop region in source image pixels
   * @param outputSize - Output square size in pixels (default 400)
   * @returns Local URI of the cropped image
   */
  async cropSquare(uri: string, region: CropRegion, outputSize = 400): Promise<string> {
    const safeRegion: CropRegion = {
      originX: Math.max(0, Math.round(region.originX)),
      originY: Math.max(0, Math.round(region.originY)),
      width: Math.max(1, Math.round(region.width)),
      height: Math.max(1, Math.round(region.height)),
    };

    const result = await manipulateAsync(
      uri,
      [{ crop: safeRegion }, { resize: { width: outputSize } }],
      { compress: 0.85, format: SaveFormat.JPEG }
    );

    return result.uri;
  },
};
