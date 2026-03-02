import random
import discord
from discord.commands import Option
from discord.ext import commands
from database.repository import count_quiz_questions, get_random_quiz_questions, list_quiz_topics, upsert_quiz_score
from .quiz_interaction import create_view


async def autocomplete_tema(ctx: discord.AutocompleteContext):
    search = ctx.value.lower()
    results = list_quiz_topics(search)
    return results if results else ["No results found"]


class Quiz(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.slash_command(name="banquea", description="Responde bancos de preguntas")
    async def banquea(self, ctx: discord.ApplicationContext, tema: Option(str, "Elige un tema", autocomplete=autocomplete_tema)):  # type: ignore
        await ctx.defer(ephemeral=True)

        if count_quiz_questions(tema) < 7:
            await ctx.followup.send("No hay suficientes preguntas para este tema.", ephemeral=True)
            return

        questions = get_random_quiz_questions(tema, 7)
        correct_count = 0
        question_index = 0
        initial_message = None

        async def update_question_message(interaction, question):
            nonlocal question_index, initial_message

            answers = [
                question["respuesta_correcta"],
                question["respuesta_incorrecta1"],
                question["respuesta_incorrecta2"],
                question["respuesta_incorrecta3"],
            ]
            random.shuffle(answers)
            correct_answer_index = answers.index(question["respuesta_correcta"])
            correct_answer_label = chr(65 + correct_answer_index)
            correct_answer_text = answers[correct_answer_index]

            embed = discord.Embed(
                title=f"Pregunta {question_index + 1}",
                description=question["pregunta"],
                color=discord.Color.blue(),
            )
            for i, answer in enumerate(answers):
                embed.add_field(name=f"Opcion {chr(65 + i)}", value=answer, inline=False)

            view = create_view(
                answers,
                question["razon"],
                correct_answer_label,
                correct_answer_text,
                update_score,
                next_question,
                question_index,
            )
            if initial_message is None:
                initial_message = await interaction.followup.send(embed=embed, view=view)
            else:
                await initial_message.edit(embed=embed, view=view)

        async def next_question(interaction):
            nonlocal question_index
            try:
                if question_index < len(questions) - 1:
                    question_index += 1
                    await update_question_message(interaction, questions[question_index])
                else:
                    upsert_quiz_score(ctx.author.id, correct_count, len(questions))
                    await initial_message.edit(
                        content=f"Juego terminado! Tu puntuacion fue {correct_count}/{len(questions)}",
                        embed=None,
                        view=None,
                    )
            except Exception:
                await interaction.followup.send("Ocurrio un error al pasar a la siguiente pregunta. Intenta nuevamente.", ephemeral=True)

        def update_score(is_correct):
            nonlocal correct_count
            if is_correct:
                correct_count += 1

        await update_question_message(ctx.interaction, questions[0])


def setup(bot: commands.Bot):
    bot.add_cog(Quiz(bot))
