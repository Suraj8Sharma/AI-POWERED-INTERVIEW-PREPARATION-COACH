import streamlit as st

import streamlit as st

import numpy as np


# Method 1: Uploading a Video File
st.title("Upload Video")
video_file = st.file_uploader("Upload a video file", type=["mp4", "mov", "avi"])
if video_file:
    st.video(video_file)


st.title("Live Camera Feed")



st.sidebar.title("AI-POWERED-INTERVIEW-PREPARATION-COACH")



values=["AI_ENGINEER","DEVOPS ENGINEER","DATA SCIENTIST"]
selected_role=st.selectbox("Choose your job role...",values)

if st.button("Choose the following...."):
    options=["Hard","Medium","Easy"]
    st.selectbox("Choose the difficulty",options)

user_video=st.camera_input("Camera")
