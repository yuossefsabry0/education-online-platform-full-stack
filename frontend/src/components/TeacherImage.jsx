// The backend Teacher model has no image/photo field (verified in
// prisma/schema.prisma), so every teacher card uses a deterministic
// illustrative placeholder image.
export function teacherImageUrl(teacher) {
  const seed = teacher && teacher.id ? `teacher-${teacher.id}` : "teacher";
  return `https://picsum.photos/seed/${seed}/640/420`;
}

export default function TeacherImage({ teacher, alt }) {
  return (
    <img
      className="zoom-img"
      src={teacherImageUrl(teacher)}
      alt={alt || (teacher && teacher.name ? `Illustrative image for ${teacher.name}` : "Teacher")}
      loading="lazy"
    />
  );
}
