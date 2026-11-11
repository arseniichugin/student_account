import { StudentHeaderSkeleton } from "@/components/dean-grades/dean-skeletons";
import { GradesSkeleton } from "@/components/grades/grades-skeleton";

export default function DeanStudentLoading() {
  return (
    <div className="space-y-5">
      <StudentHeaderSkeleton />
      <GradesSkeleton />
    </div>
  );
}
