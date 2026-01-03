import { respondWithJSON } from "./json";
import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { randomBytes } from "crypto";
import {
  dbVideoToSignedVideo,
  getVideoAspectRatio,
  processVideoForFastStart,
} from "../videos";

const MAX_UPLOAD_SIZE = 1 << 30; // 1 GB

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Video not found");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError("You can only upload your own videos");
  }

  const formData = await req.formData();
  const file = formData.get("video");
  if (!(file instanceof File)) {
    throw new BadRequestError("Video file missing");
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("File exceeds upload limit of 1GB");
  }
  if (file.type !== "video/mp4") {
    throw new BadRequestError("File is not an MP4 video");
  }

  const temp = Bun.file("temp.mp4");
  await Bun.write(temp, file);
  const aspectRatio = await getVideoAspectRatio(temp.name!);
  const processedFilePath = await processVideoForFastStart(temp.name!);
  const processed = Bun.file(processedFilePath);

  const key = `${aspectRatio}/${randomBytes(32).toString("hex")}.mp4`;
  const s3file = cfg.s3Client.file(key);
  await s3file.write(processed, { type: file.type });

  video.videoURL = key;
  updateVideo(cfg.db, video);

  // cleanup
  await temp.delete();
  await processed.delete();

  return respondWithJSON(200, dbVideoToSignedVideo(cfg, video));
}
