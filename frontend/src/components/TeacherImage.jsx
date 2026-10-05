import SafeImg from "./SafeImg.jsx";

export function teacherImageUrl(teacher) {
  const seed = teacher && teacher.id ? `teacher-${teacher.id}` : "teacher";
  return `https://picsum.photos/seed/${seed}/640/420`;
}

export default function TeacherImage({ teacher, alt }) {
  const label = alt || (teacher && teacher.name ? `Placeholder illustrative image for ${teacher.name}` : "Placeholder teacher image");
  return (
    <SafeImg
      className="zoom-img"
      src={teacherImageUrl(teacher)}
      alt={label}
      label={teacher && teacher.name ? teacher.name : "Teacher"}
    />
  );
}
