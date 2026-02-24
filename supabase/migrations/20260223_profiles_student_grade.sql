-- Admin-provided course grade (50% of final grade).

alter table public.profiles
  add column if not exists student_grade numeric(5, 2);

update public.profiles
set student_grade = null
where student_grade is not null
  and (student_grade < 0 or student_grade > 100);

alter table public.profiles
  drop constraint if exists student_grade_valid;

alter table public.profiles
  add constraint student_grade_valid
    check (
      student_grade is null or (student_grade >= 0 and student_grade <= 100)
    );
