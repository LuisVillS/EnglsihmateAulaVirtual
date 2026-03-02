-- Merged repository schema entrypoint.
-- Applies the base schema plus every migration in commit order.
-- This preserves the exact SQL from the project without duplicating it into a second snapshot.

\ir schema.sql
\ir migrations/20260222_default_admin_guard.sql
\ir migrations/20260222_duolingo_module.sql
\ir migrations/20260222_template_session_exercises.sql
\ir migrations/20260223_lesson_quiz_attempts.sql
\ir migrations/20260223_lesson_quiz_repeat_limit.sql
\ir migrations/20260223_profiles_student_grade.sql
\ir migrations/20260223_user_progress_quiz_scoring.sql
\ir migrations/20260225_course_email_automations.sql
\ir migrations/20260227_exercise_skill_tags_listening.sql
\ir migrations/20260228_reading_exercise_type.sql
\ir migrations/20260301_session_flashcards.sql
\ir migrations/20260302_flashcards_library.sql
\ir migrations/20260302_lesson_quiz_attempt_score.sql
\ir migrations/20260302_user_progress_answer_snapshot.sql
