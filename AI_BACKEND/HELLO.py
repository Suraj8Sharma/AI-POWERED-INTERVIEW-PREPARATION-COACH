from langchain_huggingface import ChatHuggingFace,HuggingFaceEndpoint
from dotenv import load_dotenv
load_dotenv()
llm=HuggingFaceEndpoint(
    repo_id="meta-llama/Llama-3.1-8B-Instruct",
    task="text-generaion"
)
model=ChatHuggingFace(llm=llm)
result=model.invoke("Hello Do you know about Pm Of india ")
print(result.content)