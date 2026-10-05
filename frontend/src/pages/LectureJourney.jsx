import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { downloadStoredFile, endpoints, isSafeFileUrl, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader } from "../components/ui.jsx";

const PASS_THRESHOLD = 50;

function isVideoUrl(url) {
  if (typeof url !== "string") return false;
  return /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url);
}

function learningStatsKey(userId) {
  return `edu-learning-stats-${userId ?? "anon"}`;
}

function recordWatchLocally({ lectureId, title, seconds }) {
  try {
    const stored = JSON.parse(localStorage.getItem("edu.user") || "null");
    const userId = stored && stored.id !== undefined ? stored.id : "anon";
    const key = learningStatsKey(userId);
    let parsed = { lessons: [], quizzes: [], totalLessons: null };
    try {
      const raw = localStorage.getItem(key);
      if (raw) parsed = { ...parsed, ...JSON.parse(raw) };
    } catch {
      // keep defaults
    }
    const lessons = Array.isArray(parsed.lessons) ? [...parsed.lessons] : [];
    // Avoid duplicate entries for the same lecture watch.
    if (!lessons.some((l) => l && l.lectureId === lectureId)) {
      lessons.push({
        lectureId,
        title: title || `Lecture ${lectureId}`,
        seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 60,
        watchedAt: new Date().toISOString(),
      });
    }
    localStorage.setItem(key, JSON.stringify({ ...parsed, lessons: lessons.slice(0, 500) }));
  } catch {
    return;
  }
}

function Stepper({ stage }) {
  const steps = ["Lecture", "Exam", "Material", "Video"];
  return (
    <ol className="journey-steps" aria-label="Lecture progress">
      {steps.map((label, i) => {
        const n = i + 1;
        const cls = n < stage ? "journey-step done" : n === stage ? "journey-step active" : "journey-step";
        return (
          <li key={label} className={cls} aria-current={n === stage ? "step" : undefined}>
            <span className="journey-dot" aria-hidden="true">{n < stage ? "✓" : n}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Integrated sequential lecture flow, each layer on its own distinct path:
// - entry: /lectures/:lectureId (title + details + "Go to Lecture" -> exam)
// - files: /lectures/:lectureId/files (lecture files layer only)
// - video: /lectures/:lectureId/video (lecture video layer only, tracked)
// Files and video never render stacked; navigation moves between paths.
export default function LectureJourney() {
  const { teacherId, lectureId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [journey, setJourney] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [watching, setWatching] = useState(false);
  const [watchError, setWatchError] = useState(null);
  const [watched, setWatched] = useState(false);
  const [watchSeconds, setWatchSeconds] = useState(0);
  const createdUrls = useRef([]);

  // Distinct layer from the URL path (legacy ?stage= is mapped, not stacked).
  const path = location.pathname || "";
  const legacyStage = searchParams.get("stage");
  let layer = "entry";
  if (path.endsWith("/files")) layer = "files";
  else if (path.endsWith("/video")) layer = "video";
  else if (legacyStage === "video") layer = "video";
  else if (legacyStage === "material" || legacyStage === "files") layer = "files";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await endpoints.lectureJourney(teacherId, lectureId);
      setJourney(data);
    } catch (err) {
      setJourney(null);
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }, [teacherId, lectureId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const urls = createdUrls.current;
    return () => {
      for (const u of urls) {
        try {
          window.URL.revokeObjectURL(u);
        } catch {
          continue;
        }
      }
      urls.length = 0;
    };
  }, []);

  useEffect(() => {
    if (!watched) return;
    const id = window.setInterval(() => setWatchSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [watched]);

  async function openStoredFile(fileUrl, title, contentId) {
    try {
      const blob = await downloadStoredFile(
        fileUrl,
        contentId ? { params: { contentId } } : { params: { contentId: journey?.lecture?.id } }
      );
      const url = window.URL.createObjectURL(blob);
      createdUrls.current.push(url);
      const opened = window.open(url, "_blank", "noreferrer");
      if (!opened) {
        const a = document.createElement("a");
        a.href = url;
        a.download = title || "attachment";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch {
      setWatchError({ message: "Could not open the lecture file." });
    }
  }

  async function handleWatch() {
    if (!journey || watching || watched) {
      return;
    }
    setWatching(true);
    setWatchError(null);
    try {
      await endpoints.recordLectureWatch(teacherId, lectureId, { secondsWatched: 60 });
      setWatched(true);
      recordWatchLocally({ lectureId: Number(lectureId), title: journey.lecture?.title, seconds: 60 });
    } catch (err) {
      setWatchError(toApiError(err));
    } finally {
      setWatching(false);
    }
  }

  function goFiles() {
    navigate(`/content/teacher/${teacherId}/lectures/${lectureId}/files`);
  }

  function goVideo() {
    navigate(`/content/teacher/${teacherId}/lectures/${lectureId}/video`);
  }

  function goEntry() {
    navigate(`/content/teacher/${teacherId}/lectures/${lectureId}`);
  }

  const basePath = `/content/teacher/${teacherId}/lectures/${lectureId}`;

  // Legacy ?stage= links resolve to the same distinct paths without stacking.
  useEffect(() => {
    if (!journey || journey.locked || !journey.passed) return;
    if (!path.endsWith("/files") && !path.endsWith("/video") && legacyStage) {
      navigate(legacyStage === "video" ? `${basePath}/video` : `${basePath}/files`, { replace: true });
    }
  }, [journey, path, legacyStage, basePath, navigate]);

  if (loading) return <div className="page"><Loader label="Loading lecture..." /></div>;
  if (error) {
    return (
      <div className="page page-narrow">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/content/teacher/${teacherId}`)}>
          ← Back to lectures
        </button>
        <h1>Lecture</h1>
        <ErrorBox error={error} onRetry={load} />
      </div>
    );
  }

  const lecture = journey.lecture || {};
  const exams = journey.exams || [];
  // Distinct video layer (legacy fileUrl kept as fallback for old lectures).
  const videoUrl = lecture.videoUrl || lecture.fileUrl || null;
  const showVideo = isVideoUrl(videoUrl || "");
  // Distinct files layer companion (own path, never stacked with video).
  const files = journey.files || null;
  const filesUrl = files ? files.fileUrl : null;
  const stage = journey.locked ? 1 : !journey.passed ? 2 : layer === "video" ? 4 : layer === "files" ? 3 : 2;

  return (
    <div className="page page-narrow">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/content/teacher/${teacherId}`)}>
        ← Back to lectures
      </button>
      <p className="eyebrow">Lecture {journey.position} of {journey.totalLectures}</p>
      <h1>{lecture.title}</h1>
      <Stepper stage={stage} />

      {journey.locked ? (
        <div className="form-card journey-locked">
          <h2 style={{ marginTop: 0 }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-lock preview-icon" aria-hidden="true" focusable="false" style={{ verticalAlign: "-3px", marginRight: "0.35rem" }}>
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Locked tier
          </h2>
          <p className="muted">{journey.lockedReason}</p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-dark"
              onClick={() => navigate(`/content/teacher/${teacherId}/lectures/${journey.lockedByLecture.id}`)}
            >
              Go to Lecture {lecturesLabel(journey)}
            </button>
          </div>
        </div>
      ) : layer === "files" ? (
        // Distinct files layer path — never stacked with the video layer.
        <div className="form-card journey-material">
          <p className="eyebrow center">Layer 3 · Lecture files</p>
          <h2 className="center" style={{ marginTop: 0 }}>{lecture.title} — Files</h2>
          {!journey.passed ? (
            <p className="muted center small">Pass the exam with at least {journey.passThreshold || PASS_THRESHOLD}% to unlock this layer.</p>
          ) : (
            <>
              <p className="muted center small">Exam passed{typeof journey.bestPercent === "number" ? ` · Score ${journey.bestPercent}%` : ""} — files layer unlocked ✓</p>
              {files && filesUrl && isSafeFileUrl(filesUrl) ? (
                <>
                  {files.title ? <p className="center" style={{ marginBottom: "0.25rem" }}><strong>{files.title}</strong></p> : null}
                  {files.body ? <p className="muted center small" style={{ whiteSpace: "pre-wrap" }}>{files.body}</p> : null}
                  <div className="btn-row" style={{ justifyContent: "center" }}>
                    {String(filesUrl).startsWith("/api/files/") ? (
                      <button type="button" className="btn btn-dark btn-sm" onClick={() => openStoredFile(filesUrl, files.title || lecture.title, files.id)}>
                        Open lecture files
                      </button>
                    ) : (
                      <a className="btn btn-dark btn-sm" href={filesUrl} target="_blank" rel="noreferrer">
                        Open lecture files
                      </a>
                    )}
                  </div>
                </>
              ) : (
                <EmptyState title="No files yet" hint="Your instructor will upload the lecture files on this path." />
              )}
              {watchError ? <ErrorBox error={watchError} /> : null}
              <div className="btn-row journey-layer-nav" style={{ justifyContent: "space-between" }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={goEntry}>
                  ← Lecture
                </button>
                <button type="button" className="btn btn-dark exam-start-btn" onClick={goVideo}>
                  Continue to video →
                </button>
              </div>
            </>
          )}
        </div>
      ) : layer === "video" ? (
        // Distinct video layer path — never stacked with the files layer.
        <div className="form-card journey-video">
          <p className="eyebrow center">Layer 4 · Lecture video</p>
          <h2 className="center" style={{ marginTop: 0 }}>{lecture.title} — Video</h2>
          {!journey.passed ? (
            <p className="muted center small">Pass the exam with at least {journey.passThreshold || PASS_THRESHOLD}% to unlock this layer.</p>
          ) : (
            <>
              {videoUrl && isSafeFileUrl(videoUrl) ? (
                showVideo ? (
                  String(videoUrl).startsWith("/api/files/") ? (
                    <VideoPlayer fileUrl={videoUrl} contentId={lecture.id} title={lecture.title} />
                  ) : (
                    <video className="journey-player" controls preload="metadata" src={videoUrl} aria-label={`${lecture.title} video`}>
                      Your browser does not support video playback.
                    </video>
                  )
                ) : (
                  <div className="btn-row" style={{ justifyContent: "center" }}>
                    {String(videoUrl).startsWith("/api/files/") ? (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openStoredFile(videoUrl, lecture.title, lecture.id)}>
                        Open lecture video
                      </button>
                    ) : (
                      <a className="btn btn-ghost btn-sm" href={videoUrl} target="_blank" rel="noreferrer">
                        Open lecture video
                      </a>
                    )}
                  </div>
                )
              ) : (
                <EmptyState title="Video coming soon" hint="Your instructor will upload the lecture video on this path." />
              )}
              {watchError ? <ErrorBox error={watchError} /> : null}
              {!watched ? (
                <div className="btn-row" style={{ justifyContent: "center" }}>
                  <button type="button" className="btn btn-dark btn-sm" disabled={watching} onClick={handleWatch}>
                    {watching ? "Tracking…" : "Mark as watched"}
                  </button>
                </div>
              ) : null}
              <p className="muted center small" style={{ marginBottom: 0 }}>
                {watched ? `✓ Watching tracked${watchSeconds > 0 ? ` · ${watchSeconds}s` : ""} — saved to your profile statistics.` : "Watching this lecture is tracked in your profile statistics, alongside exam results."}
              </p>
              <div className="btn-row journey-layer-nav" style={{ justifyContent: "space-between" }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={goFiles}>
                  ← Files
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/profile")}>
                  View my statistics
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Tier 1 — entry path: title + details only + Go to Lecture -> exam */}
          <div className="form-card journey-entry">
            <h2 style={{ marginTop: 0 }}>{lecture.title}</h2>
            {lecture.body ? <p style={{ whiteSpace: "pre-wrap" }}>{lecture.body}</p> : <p className="muted">Details coming soon from your instructor.</p>}
            {journey.bestPercent !== null && journey.bestPercent !== undefined ? (
              <p className="muted small">
                Best exam score: <strong>{journey.bestPercent}%</strong>
                {journey.passed ? " · Passed ✓" : ` · Need ${PASS_THRESHOLD}% to unlock the next layers`}
              </p>
            ) : (
              <p className="muted small">Pass the exam with at least {journey.passThreshold || PASS_THRESHOLD}% to unlock the files and video layers, each on its own path.</p>
            )}
            {!journey.passed ? (
              <div className="btn-row" style={{ justifyContent: "center" }}>
                {exams.length === 0 ? (
                  <span className="muted small">No exam published for this lecture yet — check back soon.</span>
                ) : exams.length === 1 ? (
                  <button
                    type="button"
                    className="btn btn-dark exam-start-btn"
                    onClick={() => navigate(`/content/teacher/${teacherId}/exams/${exams[0].id}?lectureId=${lectureId}`)}
                  >
                    Go to Lecture
                  </button>
                ) : (
                  <div className="content-list" style={{ width: "100%" }}>
                    {exams.map((ex) => (
                      <div key={ex.id} className="teacher-sub-card">
                        <div className="teacher-sub-info">
                          <strong>{ex.title}</strong>
                          <span className="muted small">{ex.questionCount} questions · {Math.round((ex.timeLimitSeconds || 600) / 60)} min</span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-dark btn-sm"
                          onClick={() => navigate(`/content/teacher/${teacherId}/exams/${ex.id}?lectureId=${lectureId}`)}
                        >
                          Go to Lecture
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Unlocked: two distinct onward paths — files and video separately.
              <div className="journey-layer-grid">
                <button type="button" className="journey-layer-card" onClick={goFiles}>
                  <span className="journey-layer-emoji" aria-hidden="true">📁</span>
                  <strong>Lecture files</strong>
                  <span className="muted small">Layer 3 · Own path{files && files.hasFile ? " · Ready ✓" : ""}</span>
                  <span className="btn btn-dark btn-sm">Open files →</span>
                </button>
                <button type="button" className="journey-layer-card" onClick={goVideo}>
                  <span className="journey-layer-emoji" aria-hidden="true">🎬</span>
                  <strong>Lecture video</strong>
                  <span className="muted small">Layer 4 · Own path{videoUrl ? " · Ready ✓" : " · Coming soon"}</span>
                  <span className="btn btn-dark btn-sm">Watch video →</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function lecturesLabel() {
  return "";
}

function VideoPlayer({ fileUrl, contentId, title }) {
  const [src, setSrc] = useState(null);
  const [loadError, setLoadError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    async function fetchBlob() {
      try {
        const blob = await downloadStoredFile(fileUrl, { params: { contentId } });
        if (cancelled) return;
        objectUrl = window.URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setLoadError({ message: `Could not load video${title ? ` "${title}"` : ""}.` });
      }
    }
    fetchBlob();
    return () => {
      cancelled = true;
      if (objectUrl) {
        try {
          window.URL.revokeObjectURL(objectUrl);
        } catch {
          return;
        }
      }
    };
  }, [fileUrl, contentId, title]);
  if (loadError) return <ErrorBox error={loadError} />;
  if (!src) return <Loader label="Loading video..." />;
  return (
    <video className="journey-player" controls preload="metadata" src={src} aria-label={`${title || "Lecture"} video`}>
      Your browser does not support video playback.
    </video>
  );
}
