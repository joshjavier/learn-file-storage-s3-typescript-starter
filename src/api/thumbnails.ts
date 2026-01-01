import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import path from "path";

const MAX_UPLOAD_SIZE = 10 << 20;

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
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
    throw new UserForbiddenError(
      "You can only upload thumbnails to your own videos",
    );
  }

  const formData = await req.formData();
  const file = formData.get("thumbnail");
  if (!(file instanceof File)) {
    throw new BadRequestError("Thumbnail file missing");
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("File too large, max upload size is 10MB");
  }

  if (!file.type.startsWith("image/")) {
    throw new BadRequestError("File is not an image");
  }
  const fileExtension = file.type.match(/^image\/([a-z]+)$/)![1];

  const destination = path.join(cfg.assetsRoot, `${video.id}.${fileExtension}`);
  const data = await file.arrayBuffer();
  await Bun.write(destination, data);

  video.thumbnailURL = `http://localhost:${cfg.port}/${destination}`;
  updateVideo(cfg.db, video);

  return respondWithJSON(200, video);
}
