from openai.types.chat import ChatCompletionContentPartParam, ChatCompletionMessageParam
from prompts.prompt_types import Stack, is_react_native_stack
from prompts import system_prompt
from prompts.design_system import build_design_system_prompt_block
from prompts.policies import build_selected_stack_policy, build_user_image_policy


def build_video_prompt_messages(
    video_data_url: str,
    stack: Stack,
    text_prompt: str,
    image_generation_enabled: bool,
    design_system: str | None = None,
) -> list[ChatCompletionMessageParam]:
    image_policy = build_user_image_policy(image_generation_enabled)
    selected_stack = build_selected_stack_policy(stack)
    design_system_block = build_design_system_prompt_block(design_system)
    mobile = is_react_native_stack(stack)
    app_kind = "mobile app" if mobile else "web app"
    interact = (
        "MAKE THE APP FUNCTIONAL using React Native state and Pressable/TextInput. "
        "Allow the user to interact with the app and get the same behavior as shown in the video."
        if mobile
        else (
            "MAKE THE APP FUNCTIONAL using JavaScript. Allow the user to interact "
            "with the app and get the same behavior as shown in the video."
        )
    )
    user_text = f"""
    You have been given a video of a user interacting with a {app_kind}. You need to re-create the same app exactly such that the same user interactions will produce the same results in the app you build.

    - Watch the entire video carefully and understand all the user interactions and UI state changes.
    - Make sure the app looks exactly like what you see in the video.
    - Pay close attention to background color, text color, font size, font family,
    padding, margin, border, etc. Match the colors and sizes exactly.
    - {image_policy}
    - If some functionality requires a backend call, just mock the data instead.
    - {interact}
    - Use SVGs and interactive {"components" if mobile else "3D elements"} if needed to match the functionality shown in the video.
{"    - Output React Native / Expo TypeScript (App.tsx). Never HTML/CSS/Tailwind CDN." if mobile else ""}

    Analyze this video and generate the code.
    
    {selected_stack}
    {design_system_block}
    """
    if text_prompt.strip():
        user_text = user_text + "\n\nAdditional instructions: " + text_prompt

    user_content: list[ChatCompletionContentPartParam] = [
        {
            "type": "image_url",
            "image_url": {"url": video_data_url, "detail": "high"},
        },
        {
            "type": "text",
            "text": user_text,
        },
    ]

    return [
        {
            "role": "system",
            "content": system_prompt.get_system_prompt(stack),
        },
        {
            "role": "user",
            "content": user_content,
        },
    ]
