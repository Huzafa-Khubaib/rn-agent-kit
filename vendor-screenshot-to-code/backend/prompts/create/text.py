from openai.types.chat import ChatCompletionMessageParam

from prompts.prompt_types import Stack, is_react_native_stack
from prompts import system_prompt
from prompts.design_system import build_design_system_prompt_block
from prompts.policies import build_selected_stack_policy, build_user_image_policy


def build_text_prompt_messages(
    text_prompt: str,
    stack: Stack,
    image_generation_enabled: bool,
    design_system: str | None = None,
) -> list[ChatCompletionMessageParam]:
    image_policy = build_user_image_policy(image_generation_enabled)
    selected_stack = build_selected_stack_policy(stack)
    design_system_block = build_design_system_prompt_block(design_system)
    mobile = is_react_native_stack(stack)

    USER_PROMPT = f"""
Generate UI for {text_prompt}.
{selected_stack}
{design_system_block}

# Instructions

- Make sure to make it look modern and sleek.
- Use modern, professional fonts and colors.
- Follow UX best practices.
{"- Output React Native / Expo TypeScript (App.tsx) with StyleSheet — never HTML." if mobile else ""}
- {image_policy}"""

    return [
        {
            "role": "system",
            "content": system_prompt.get_system_prompt(stack),
        },
        {
            "role": "user",
            "content": USER_PROMPT,
        },
    ]
