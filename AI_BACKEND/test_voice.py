import pyttsx3

def test_speech():
    # 1. Initialize the engine
    engine = pyttsx3.init()

    # 2. Configure Properties (Optional but recommended)
    # Rate = Speed of speech (default is usually around 200)
    rate = engine.getProperty('rate')
    engine.setProperty('rate', 150)  # Slow it down slightly for clarity

    # Volume = 0.0 to 1.0
    volume = engine.getProperty('volume')
    engine.setProperty('volume', 1.0) # Max volume

    # 3. The Text you want to test
    text = "Hello Suraj! I am your AI Interviewer. Let's start so firstly tell me about yourself?"

    print("Speaking now...")
    
    # 4. Queue the text and play it
    engine.say(text)
    
    # 5. Block while processing (This makes the program wait until speech is done)
    engine.runAndWait()
    print("Done!")

if __name__ == "__main__":
    test_speech()