import asyncio
from datetime import timezone

import discord

from database.repository import get_student_by_discord_id, update_practice_session
from services.practice_engine import (
    apply_practice_item_result,
    build_discord_practice_session,
    complete_discord_practice_session,
    evaluate_step_answer,
)


def _truncate_label(value, limit):
    text = str(value or "").strip()
    if len(text) <= limit:
        return text or "-"
    return f"{text[: limit - 3].rstrip()}..."


def _is_true_false_choice(options):
    normalized = [str(option or "").strip().lower() for option in options]
    return normalized == ["true", "false"] or normalized == ["false", "true"]


def _audio_button_label(audio_url):
    audio_text = str(audio_url or "").lower()
    return "Open video" if "youtu" in audio_text else "Open audio"


def _can_render_choice_buttons(options):
    return bool(options) and len(options) <= 4 and all(len(_truncate_label(option, 80)) <= 80 for option in options)


def _is_generic_context_title(value):
    normalized = str(value or "").strip().lower()
    return normalized in {
        "",
        "fill in the blanks",
        "image match",
        "pairs",
        "scramble",
        "listening exercise",
        "reading exercise",
    }


def _is_generic_context_body(value):
    normalized = str(value or "").strip().lower()
    return normalized in {
        "",
        "look at the image and choose the right answer.",
        "match the term with the correct translation.",
        "use the button below before answering.",
        "listen to the audio before answering.",
        "listen and type the answer.",
    }


class PracticeRunner:
    def __init__(self, ctx, student, session_data):
        self.ctx = ctx
        self.student = student
        self.session_data = session_data
        self.items = session_data["items"]
        self.session_id = session_data["id"]
        self.mode = session_data["mode"]
        self.current_item_index = 0
        self.current_step_index = 0
        self.current_step_results = []
        self.results = []
        self.message = None
        self.pending_advance = None
        self.finalized = False
        self.started_at = discord.utils.utcnow()
        self.current_lifetime_xp = int(session_data["gamification"]["lifetime_xp"])

    @property
    def current_item(self):
        return self.items[self.current_item_index]

    @property
    def current_step(self):
        return self.current_item["steps"][self.current_step_index]

    def is_expired(self):
        limit = self.session_data.get("time_limit_sec")
        if not limit:
            return False
        now = discord.utils.utcnow()
        return (now - self.started_at).total_seconds() >= int(limit)

    def _build_step_embed(self):
        step = self.current_step
        prompt = step.get("prompt") or "Answer the prompt."
        description_parts = []

        context_body = step.get("context_body") or ""
        if context_body and not _is_generic_context_body(context_body):
            description_parts.append(context_body if len(context_body) <= 1200 else f"{context_body[:1197].rstrip()}...")

        embed = discord.Embed(
            title=f"{prompt} - Item {self.current_item_index + 1}/{len(self.items)}",
            description="\n\n".join(description_parts) or None,
            color=discord.Color.blurple(),
        )
        context_title = step.get("context_title") or ""
        if context_title and not _is_generic_context_title(context_title):
            embed.add_field(name="Context", value=_truncate_label(context_title, 1024), inline=False)
        if step.get("audio_url"):
            embed.add_field(name="Listening", value="Use the button below before answering.", inline=False)
        if step.get("image_url"):
            embed.set_image(url=step["image_url"])
        return embed

    async def _edit_message(self, embed, view=None):
        if self.message:
            await self.message.edit(embed=embed, view=view)

    async def start(self):
        embed = self._build_step_embed()
        view = self._build_step_view()
        self.message = await self.ctx.followup.send(embed=embed, view=view, ephemeral=True)

    def _build_step_view(self):
        return PracticeChoiceView(self) if self.current_step.get("kind") == "choice" else PracticeTextView(self)

    def _build_feedback_embed(self, *, title, color, correct_answer_text="", explanation="", xp_gain=None):
        lines = []
        if explanation:
            lines.append(explanation)
        if correct_answer_text:
            lines.append(f"Correct answer: {correct_answer_text}")
        if xp_gain is not None:
            lines.append(f"XP: +{xp_gain}")
        description = "\n\n".join(lines) if lines else None
        return discord.Embed(title=title, description=description, color=color)

    async def submit_current_step(self, interaction, answer_payload):
        if self.finalized:
            return
        if self.is_expired():
            await self.finish(interaction, expired=True)
            return

        step = self.current_step
        evaluation = evaluate_step_answer(step, answer_payload)
        self.current_step_results.append(
            {
                "step_index": self.current_step_index,
                "is_correct": evaluation["is_correct"],
                "submitted_value": evaluation["submitted_value"],
                "correct_answer_text": evaluation["correct_answer_text"],
            }
        )

        is_last_step = self.current_step_index >= len(self.current_item["steps"]) - 1
        explanation = step.get("explanation") or ""
        if is_last_step:
            overall_correct = all(result["is_correct"] for result in self.current_step_results)
            answer_snapshot = {
                "steps": self.current_step_results,
                "correct_steps": sum(1 for result in self.current_step_results if result["is_correct"]),
                "total_steps": len(self.current_item["steps"]),
            }
            stored = apply_practice_item_result(
                self.student["id"],
                self.current_item["id"],
                self.current_item["practice_item_id"],
                self.mode,
                overall_correct,
                answer_snapshot,
                attempts=1,
                legacy_xp_total=self.current_lifetime_xp,
            )
            self.current_lifetime_xp = stored["gamification"]["lifetime_xp"]
            self.results.append(
                {
                    "exercise_id": self.current_item["id"],
                    "practice_item_id": self.current_item["practice_item_id"],
                    "answered": True,
                    "is_correct": overall_correct,
                    "xp_gain": stored["xp_gain"],
                    "answer_snapshot": answer_snapshot,
                }
            )
            is_last_item = self.current_item_index >= len(self.items) - 1
            self.pending_advance = "finish" if is_last_item else "next_item"
            title = "Correct" if overall_correct else "Incorrect"
            color = discord.Color.green() if overall_correct else discord.Color.red()
            embed = self._build_feedback_embed(
                title=title,
                color=color,
                correct_answer_text=evaluation["correct_answer_text"],
                explanation=explanation,
                xp_gain=stored["xp_gain"],
            )
            label = "Finish session" if is_last_item else "Next item"
        else:
            self.pending_advance = "next_step"
            title = "Correct" if evaluation["is_correct"] else "Incorrect"
            color = discord.Color.green() if evaluation["is_correct"] else discord.Color.red()
            embed = self._build_feedback_embed(
                title=title,
                color=color,
                correct_answer_text=evaluation["correct_answer_text"],
                explanation=explanation,
            )
            label = "Next step"

        await self._edit_message(embed, PracticeContinueView(self, label))

    async def advance(self, interaction):
        if self.finalized:
            return
        if self.is_expired():
            await self.finish(interaction, expired=True)
            return
        if self.pending_advance == "next_step":
            self.current_step_index += 1
        elif self.pending_advance == "next_item":
            self.current_item_index += 1
            self.current_step_index = 0
            self.current_step_results = []
        elif self.pending_advance == "finish":
            await self.finish(interaction)
            return

        self.pending_advance = None
        embed = self._build_step_embed()
        view = self._build_step_view()
        await self._edit_message(embed, view)

    async def finish(self, interaction, expired=False):
        if self.finalized:
            return
        self.finalized = True

        if not expired:
            finishing_embed = discord.Embed(
                title="Finishing session...",
                description="Saving your results.",
                color=discord.Color.blurple(),
            )
            await self._edit_message(finishing_embed, None)

        summary = await asyncio.to_thread(
            complete_discord_practice_session,
            self.student,
            self.session_id,
            self.mode,
            self.items,
            self.results,
            self.started_at.astimezone(timezone.utc),
            self.current_lifetime_xp,
        )
        self.current_lifetime_xp = int(summary["gamification"]["lifetime_xp"])

        title = "Session expired" if expired else "Practice complete"
        description = (
            f"Accuracy: {summary['accuracy_percent']}%\n"
            f"Score: {summary['correct_items']}/{summary['total_items']}\n"
            f"XP earned: +{summary['xp_earned']}\n"
            f"Weekly points: +{summary['weekly_points_earned']}"
        )
        if summary["quest_reward_xp"]:
            description = f"{description}\nQuest reward XP: +{summary['quest_reward_xp']}"
        embed = discord.Embed(title=title, description=description, color=discord.Color.gold())
        embed.set_footer(text=f"Recommended next mode: {summary['recommended_next_mode']}")

        await self._edit_message(embed, None)

    async def handle_timeout(self):
        if self.finalized or not self.message:
            return
        if self.session_data.get("time_limit_sec") and self.is_expired():
            await self.finish(_TimeoutInteraction(self.message), expired=True)
            return

        self.finalized = True
        update_practice_session(
            self.session_id,
            {
                "status": "abandoned",
                "updated_at": discord.utils.utcnow().isoformat(),
            },
        )
        embed = discord.Embed(
            title="Session closed",
            description="The practice session was closed due to inactivity.",
            color=discord.Color.orange(),
        )
        await self.message.edit(embed=embed, view=None)


class PracticeBaseView(discord.ui.View):
    def __init__(self, runner, timeout=900):
        super().__init__(timeout=timeout)
        self.runner = runner
        self._maybe_add_audio_link()

    def _maybe_add_audio_link(self):
        audio_url = self.runner.current_step.get("audio_url")
        if not audio_url:
            return
        self.add_item(discord.ui.Button(label=_audio_button_label(audio_url), style=discord.ButtonStyle.link, url=audio_url))

    async def interaction_check(self, interaction):
        if interaction.user.id != self.runner.ctx.author.id:
            await interaction.response.send_message("This practice session belongs to another user.", ephemeral=True)
            return False
        return True

    async def on_timeout(self):
        await self.runner.handle_timeout()


class PracticeChoiceView(PracticeBaseView):
    def __init__(self, runner):
        super().__init__(runner)
        options = runner.current_step.get("options") or []
        if _can_render_choice_buttons(options):
            for index, option in enumerate(options):
                button = discord.ui.Button(label=_truncate_label(option, 80), style=discord.ButtonStyle.primary)

                async def callback(interaction, selected_index=index):
                    await interaction.response.defer()
                    await self.runner.submit_current_step(interaction, {"selected_index": selected_index})

                button.callback = callback
                self.add_item(button)
            return

        self.add_item(PracticeChoiceSelect(self.runner, options))


class PracticeChoiceSelect(discord.ui.Select):
    def __init__(self, runner, options):
        select_options = [
            discord.SelectOption(
                label=_truncate_label(option, 100),
                description=f"Option {chr(64 + index)}",
                value=str(index - 1),
            )
            for index, option in enumerate(options, start=1)
        ]
        super().__init__(
            placeholder="Select your answer",
            min_values=1,
            max_values=1,
            options=select_options[:25],
        )
        self.runner = runner

    async def callback(self, interaction):
        await interaction.response.defer()
        await self.runner.submit_current_step(interaction, {"selected_index": int(self.values[0])})


class PracticeTextModal(discord.ui.Modal):
    def __init__(self, runner):
        step = runner.current_step
        modal_title = _truncate_label(step.get("prompt") or "Submit answer", 45)
        super().__init__(title=modal_title)
        self.runner = runner
        self.inputs = []
        if step.get("kind") == "multi_text":
            for index, blank in enumerate(step.get("blanks") or [], start=1):
                input_field = discord.ui.InputText(
                    label=_truncate_label(blank.get("label") or f"Blank {index}", 45),
                    placeholder=_truncate_label(f"Type the answer for blank {index}", 100),
                    required=True,
                    max_length=150,
                )
                self.inputs.append((blank.get("key") or f"blank_{index}", input_field))
                self.add_item(input_field)
        else:
            answer = discord.ui.InputText(
                label=_truncate_label(step.get("prompt") or "Your answer", 45),
                placeholder=_truncate_label(step.get("context_body") or "Type your answer here", 100),
                required=True,
                max_length=250,
            )
            self.inputs.append(("text", answer))
            self.add_item(answer)

    async def callback(self, interaction):
        await interaction.response.defer()
        if self.runner.current_step.get("kind") == "multi_text":
            answers = {
                key: input_field.value
                for key, input_field in self.inputs
            }
            await self.runner.submit_current_step(interaction, {"answers": answers})
            return
        await self.runner.submit_current_step(interaction, {"text": self.inputs[0][1].value})


class PracticeTextView(PracticeBaseView):
    def __init__(self, runner):
        super().__init__(runner)
        button = discord.ui.Button(label="Answer", style=discord.ButtonStyle.success)
        button.callback = self.open_modal
        self.add_item(button)

    async def open_modal(self, interaction):
        await interaction.response.send_modal(PracticeTextModal(self.runner))


class PracticeContinueView(PracticeBaseView):
    def __init__(self, runner, label):
        super().__init__(runner)
        button = discord.ui.Button(label=label, style=discord.ButtonStyle.success)
        button.callback = self.continue_flow
        self.add_item(button)

    async def continue_flow(self, interaction):
        await interaction.response.defer()
        await self.runner.advance(interaction)


class _TimeoutInteraction:
    def __init__(self, message):
        self.message = message
        self.response = _TimeoutResponse()


class _TimeoutResponse:
    @staticmethod
    def is_done():
        return True


def setup(bot):
    @bot.slash_command(
        name="practice",
        description="Practica ejercicios del Aula Virtual y suma progreso para el leaderboard semanal",
    )
    async def practice(ctx: discord.ApplicationContext):
        await ctx.defer(ephemeral=True)

        student = get_student_by_discord_id(ctx.author.id)
        if not student or student.get("role") != "student":
            await ctx.followup.send(
                "No encontre una cuenta estudiantil vinculada a este Discord. Conecta tu Discord en el Aula Virtual o usa /verify.",
                ephemeral=True,
            )
            return

        session_data = build_discord_practice_session(student)
        if not session_data:
            await ctx.followup.send(
                "No encontre ejercicios publicados compatibles con Discord para tu nivel actual.",
                ephemeral=True,
            )
            return

        runner = PracticeRunner(ctx, student, session_data)
        await runner.start()
