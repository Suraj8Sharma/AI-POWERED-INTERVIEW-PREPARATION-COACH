"""
PDF Report Generator for Interview Reports
"""

import io
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from typing import Dict, Any


def generate_interview_report_pdf(report_data: Dict[str, Any]) -> bytes:
    """
    Generate a PDF report from interview data.

    Args:
        report_data: Dictionary containing report information

    Returns:
        PDF content as bytes
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=30,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#6c63ff')
    )

    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Heading2'],
        fontSize=16,
        spaceAfter=20,
        textColor=colors.HexColor('#2dd4bf')
    )

    score_style = ParagraphStyle(
        'Score',
        parent=styles['Normal'],
        fontSize=14,
        alignment=TA_CENTER,
        textColor=colors.black
    )

    section_style = ParagraphStyle(
        'Section',
        parent=styles['Heading3'],
        fontSize=14,
        spaceAfter=10,
        textColor=colors.HexColor('#1f2937')
    )

    normal_style = styles['Normal']

    story = []

    # Title
    story.append(Paragraph("Interview Performance Report", title_style))
    story.append(Spacer(1, 0.5*inch))

    # Candidate Info
    candidate_info = f"""
    <b>Candidate:</b> {report_data.get('name', 'N/A')}<br/>
    <b>Role:</b> {report_data.get('role', 'N/A')}<br/>
    <b>Questions Answered:</b> {report_data.get('total_answered', 0)}<br/>
    <b>Date:</b> {report_data.get('created_at', 'N/A')}
    """
    story.append(Paragraph(candidate_info, normal_style))
    story.append(Spacer(1, 0.3*inch))

    # Overall Scores
    story.append(Paragraph("Overall Scores", subtitle_style))

    score_data = [
        ['Metric', 'Score'],
        ['Overall Score', f"{report_data.get('overall', 0)}/100"],
        ['Technical', f"{report_data.get('avg_technical', 0)}/100"],
        ['Communication', f"{report_data.get('avg_communication', 0)}/100"],
        ['Confidence', f"{report_data.get('avg_confidence', 'N/A')}/100" if report_data.get('avg_confidence') else 'N/A']
    ]

    score_table = Table(score_data, colWidths=[2*inch, 2*inch])
    score_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
    ]))
    story.append(score_table)
    story.append(Spacer(1, 0.3*inch))

    # Improvement Tips
    if report_data.get('tips'):
        story.append(Paragraph("Improvement Tips", section_style))
        for tip in report_data['tips']:
            story.append(Paragraph(f"• {tip}", normal_style))
        story.append(Spacer(1, 0.3*inch))

    # Detailed Breakdown
    if report_data.get('evaluations'):
        story.append(PageBreak())
        story.append(Paragraph("Detailed Question Breakdown", subtitle_style))

        for i, evaluation in enumerate(report_data['evaluations'], 1):
            story.append(Paragraph(f"Question {i}", section_style))

            # Question text
            question_text = evaluation.get('question_text', 'N/A')
            if len(question_text) > 100:
                question_text = question_text[:100] + "..."
            story.append(Paragraph(f"<b>Question:</b> {question_text}", normal_style))

            # User's answer
            user_answer = evaluation.get('user_answer', 'N/A')
            if len(user_answer) > 200:
                user_answer = user_answer[:200] + "..."
            story.append(Paragraph(f"<b>Your Answer:</b> {user_answer}", normal_style))

            # Scores
            scores_data = [
                ['Technical', f"{evaluation.get('technical_score', 'N/A')}/100"],
                ['Communication', f"{evaluation.get('communication_score', 'N/A')}/100"],
                ['Confidence', f"{evaluation.get('confidence_score', 'N/A')}/100"]
            ]

            scores_table = Table(scores_data, colWidths=[1.5*inch, 1*inch])
            scores_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ]))
            story.append(scores_table)

            # Feedback
            if evaluation.get('short_feedback'):
                story.append(Paragraph(f"<b>Feedback:</b> {evaluation['short_feedback']}", normal_style))

            if evaluation.get('strengths'):
                strengths = ", ".join(evaluation['strengths'][:3])
                story.append(Paragraph(f"<b>Strengths:</b> {strengths}", normal_style))

            if evaluation.get('improvements'):
                improvements = ", ".join(evaluation['improvements'][:3])
                story.append(Paragraph(f"<b>Areas for Improvement:</b> {improvements}", normal_style))

            if evaluation.get('comm_details'):
                story.append(Paragraph(f"<b>Communication Details:</b> {evaluation['comm_details']}", normal_style))

            if evaluation.get('bl_summary'):
                story.append(Paragraph(f"<b>Body Language:</b> {evaluation['bl_summary']}", normal_style))

            story.append(Spacer(1, 0.2*inch))

    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()