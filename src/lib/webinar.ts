// Grading webinar video. Swap the asset pointers to change the recording.
import video from "@/assets/grading_webinar.mp4.asset.json";
import poster from "@/assets/grading_webinar_poster.jpg.asset.json";

export const GRADING_WEBINAR = {
  url: video.url as string | null,
  poster: poster.url as string | null,
  unlockKey: "collectai_webinar_grading_unlocked",
};
