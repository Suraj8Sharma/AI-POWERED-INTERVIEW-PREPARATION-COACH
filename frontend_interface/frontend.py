import streamlit as st
import numpy as np
# Page Configuration
st.set_page_config(page_title="Smart Interview Coach", layout="wide")


#making the sidebar  
with st.sidebar:
    st.title("⚙️ Dashboard")
    st.info("Capstone Project: Smart Interview Coach")
    st.divider()
    st.subheader("Candidate Details")
    name=st.text_input("Full Name",placeholder="Suraj Sharma")
    role=st.selectbox("Target Role",["Data Scientist", "ML Engineer", "Software Dev"])
    st.divider()
    if st.button("End Interview Session"):
        st.warning("Session Ended.Generating Report...")



#making the main UI area 
st.title("🤖 AI Interview Room")
st.markdown("---")

#basically it tells the width of the two containers
col1,col2=st.columns([1,1])

with col1:
    st.subheader("Video/Audio Input")
    #placeholder the video feed
    st.image("https://via.placeholder.com/640x480.png?text=Camera+Feed+Placeholder")
    st.write("🎤 Status: Listening...")

with col2:
    st.subheader("Interview Transcript")
    # Chat UI container
    with st.container(height=300, border=True):
        st.chat_message("assistant").write("Hello Suraj! Can you explain the difference between a list and a tuple in Python?")
        st.chat_message("user").write("Lists are mutable while tuples are immutable.")
    
    user_input = st.chat_input("Type your answer here...")
st.divider()
st.subheader("Live Feedback")
st.progress(75, text="Confidence Level")
st.caption("AI Insight: You are speaking a bit fast. Try to slow down for better clarity.")