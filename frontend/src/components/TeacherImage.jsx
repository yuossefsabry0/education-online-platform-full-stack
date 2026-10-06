import SafeImg from "./SafeImg.jsx";

// Curated professional portrait photos (deterministic per teacher id).
// Admin-uploaded photoUrl still takes precedence when set.
const PORTRAITS = [
  "photo-1560250097-0b93528c311a",
  "photo-1573496359142-b8d87734a5a2",
  "photo-1519085360753-af0119f7cbe7",
  "photo-1580489944761-15a19d654956",
  "photo-1507003211169-0a1dd7228f2d",
  "photo-1544005313-94ddf0286df2",
  "photo-1500648767791-00dcc994a43e",
  "photo-1573497019940-1c28c88b4f3e",
];

export function teacherImageUrl(teacher) {
  if (teacher && typeof teacher.photoUrl === "string" && teacher.photoUrl.trim() !== "") {
    return teacher.photoUrl;
  }
  const id = teacher && Number.isInteger(teacher.id) ? teacher.id : 0;
  const portrait = PORTRAITS[id % PORTRAITS.length];
  return `https://images.unsplash.com/${portrait}?auto=format&fit=crop&w=640&q=70`;
}

export default function TeacherImage({ teacher, alt }) {
  const label = alt || (teacher && teacher.name ? `Photo of ${teacher.name}` : "Teacher photo");
  return (
    <SafeImg
      className="zoom-img"
      src={teacherImageUrl(teacher)}
      alt={label}
      label={teacher && teacher.name ? teacher.name : "Teacher"}
    />
  );
}
