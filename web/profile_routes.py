"""
PrepLoom Profile Manager — User profile and report attachment handling

Manages:
  - User profile creation and updates
  - Report attachment to profiles
  - User statistics aggregation
  - Report history tracking
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from supabase import Client

logger = logging.getLogger(__name__)


class ProfileManager:
    """Manages user profiles and their interview reports."""
    
    def __init__(self, supabase: Client):
        """Initialize ProfileManager with Supabase client."""
        self.supabase = supabase
    
    # ═══════════════════════════════════════════════════════════════════════
    # Profile Management
    # ═══════════════════════════════════════════════════════════════════════
    
    async def ensure_profile_exists(self, user_id: str, email: str, name: str = "") -> Dict[str, Any]:
        """
        Ensure a user profile exists, creating it if necessary.
        
        Args:
            user_id: Supabase user ID
            email: User email address
            name: User's display name
            
        Returns:
            Profile data dictionary
        """
        try:
            # Try to get existing profile
            response = self.supabase.table("profiles").select("*").eq("id", user_id).limit(1).execute()
            
            if response.data and len(response.data) > 0:
                # Profile exists, update if needed
                profile = response.data[0]
                if name and name.strip() and profile.get("full_name") != name:
                    return await self.update_profile(user_id, {"full_name": name})
                return profile
            
            # Create new profile
            profile_data = {
                "id": user_id,
                "email": email,
                "full_name": name or email.split("@")[0],
                "created_at": datetime.now().isoformat(),
            }
            
            response = self.supabase.table("profiles").insert(profile_data).select("*").execute()
            
            if response.data and len(response.data) > 0:
                logger.info(f"Profile created for user: {user_id}")
                return response.data[0]
            
            raise Exception("Failed to create profile")
            
        except Exception as e:
            logger.error(f"Error ensuring profile exists: {e}")
            raise
    
    async def get_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user profile by ID.
        
        Args:
            user_id: Supabase user ID
            
        Returns:
            Profile data or None
        """
        try:
            response = self.supabase.table("profiles").select("*").eq("id", user_id).limit(1).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting profile: {e}")
            return None
    
    async def update_profile(self, user_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update user profile.
        
        Args:
            user_id: Supabase user ID
            updates: Dictionary of fields to update
            
        Returns:
            Updated profile data
        """
        try:
            updates["updated_at"] = datetime.now().isoformat()
            response = self.supabase.table("profiles").update(updates).eq("id", user_id).select("*").execute()
            
            if response.data and len(response.data) > 0:
                logger.info(f"Profile updated for user: {user_id}")
                return response.data[0]
            
            raise Exception("Failed to update profile")
            
        except Exception as e:
            logger.error(f"Error updating profile: {e}")
            raise
    
    # ═══════════════════════════════════════════════════════════════════════
    # Report Attachment & Management
    # ═══════════════════════════════════════════════════════════════════════
    
    async def attach_report_to_profile(
        self,
        user_id: str,
        session_id: str,
        report_data: Dict[str, Any],
        pdf_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Attach an interview report to a user's profile.
        
        Args:
            user_id: Supabase user ID
            session_id: Interview session ID
            report_data: Report data dictionary
            pdf_path: Optional path to stored PDF
            
        Returns:
            Stored report data with ID
        """
        try:
            # Ensure profile exists
            await self.ensure_profile_exists(user_id, report_data.get("email", ""))
            
            # Prepare report record
            report_record = {
                "user_id": user_id,
                "session_id": session_id,
                "candidate_name": report_data.get("name", ""),
                "role": report_data.get("role", ""),
                "total_questions": report_data.get("total_answered", 0),
                "overall_score": report_data.get("overall", 0),
                "avg_technical": report_data.get("avg_technical", 0),
                "avg_communication": report_data.get("avg_communication", 0),
                "avg_confidence": report_data.get("avg_confidence"),
                "evaluations": report_data.get("evaluations", []),
                "tips": report_data.get("tips", []),
                "pdf_path": pdf_path,
                "created_at": datetime.now().isoformat(),
            }
            
            # Check for existing report with this session_id
            existing = self.supabase.table("interview_reports").select("id").eq("session_id", session_id).limit(1).execute()
            
            if existing.data and len(existing.data) > 0:
                # Update existing report
                response = self.supabase.table("interview_reports").update(report_record).eq("session_id", session_id).select("*").execute()
                if response.data:
                    logger.info(f"Report updated: {session_id}")
                    return response.data[0]
            else:
                # Create new report
                response = self.supabase.table("interview_reports").insert(report_record).select("*").execute()
                if response.data and len(response.data) > 0:
                    logger.info(f"Report attached to profile: {user_id}")
                    return response.data[0]
            
            raise Exception("Failed to attach report")
            
        except Exception as e:
            logger.error(f"Error attaching report to profile: {e}")
            raise
    
    async def get_user_reports(self, user_id: str, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """
        Get all interview reports for a user.
        
        Args:
            user_id: Supabase user ID
            limit: Maximum number of reports to return
            offset: Number of reports to skip
            
        Returns:
            List of report data
        """
        try:
            response = (
                self.supabase.table("interview_reports")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )
            return response.data or []
        except Exception as e:
            logger.error(f"Error getting user reports: {e}")
            return []
    
    async def get_report_by_id(self, report_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Get a specific report by ID.
        
        Args:
            report_id: Report ID
            user_id: Optional user ID for access control
            
        Returns:
            Report data or None
        """
        try:
            query = self.supabase.table("interview_reports").select("*").eq("id", report_id)
            
            if user_id:
                query = query.eq("user_id", user_id)
            
            response = query.limit(1).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting report: {e}")
            return None
    
    async def delete_report(self, report_id: str, user_id: Optional[str] = None) -> bool:
        """
        Delete a report.
        
        Args:
            report_id: Report ID
            user_id: Optional user ID for access control
            
        Returns:
            True if successful, False otherwise
        """
        try:
            query = self.supabase.table("interview_reports").delete().eq("id", report_id)
            
            if user_id:
                query = query.eq("user_id", user_id)
            
            response = query.execute()
            logger.info(f"Report deleted: {report_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting report: {e}")
            return False
    
    # ═══════════════════════════════════════════════════════════════════════
    # Statistics & Analytics
    # ═══════════════════════════════════════════════════════════════════════
    
    async def get_user_statistics(self, user_id: str) -> Dict[str, Any]:
        """
        Get aggregated statistics for a user across all reports.
        
        Args:
            user_id: Supabase user ID
            
        Returns:
            Statistics dictionary
        """
        try:
            # Try to get from view first
            response = self.supabase.table("user_interview_stats").select("*").eq("user_id", user_id).limit(1).execute()
            
            if response.data and len(response.data) > 0:
                return response.data[0]
            
            # Fallback: calculate from reports
            reports = await self.get_user_reports(user_id, limit=1000)
            
            if not reports:
                return {
                    "user_id": user_id,
                    "total_interviews": 0,
                    "avg_overall_score": 0,
                    "avg_technical": 0,
                    "avg_communication": 0,
                    "avg_confidence": 0,
                    "unique_roles": 0,
                    "last_interview_date": None,
                    "roles_practiced": []
                }
            
            overall_scores = [r.get("overall_score", 0) for r in reports]
            tech_scores = [r.get("avg_technical", 0) for r in reports]
            comm_scores = [r.get("avg_communication", 0) for r in reports]
            conf_scores = [r.get("avg_confidence", 0) for r in reports if r.get("avg_confidence")]
            
            roles = list(set(r.get("role", "") for r in reports if r.get("role")))
            
            return {
                "user_id": user_id,
                "total_interviews": len(reports),
                "avg_overall_score": round(sum(overall_scores) / len(overall_scores), 1) if overall_scores else 0,
                "avg_technical": round(sum(tech_scores) / len(tech_scores), 1) if tech_scores else 0,
                "avg_communication": round(sum(comm_scores) / len(comm_scores), 1) if comm_scores else 0,
                "avg_confidence": round(sum(conf_scores) / len(conf_scores), 1) if conf_scores else 0,
                "unique_roles": len(roles),
                "last_interview_date": reports[0].get("created_at") if reports else None,
                "roles_practiced": roles
            }
            
        except Exception as e:
            logger.error(f"Error getting user statistics: {e}")
            return {}
    
    async def get_user_progress_timeline(self, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get user's progress timeline showing score improvements over time.
        
        Args:
            user_id: Supabase user ID
            limit: Maximum number of data points
            
        Returns:
            List of progress points with timestamps and scores
        """
        try:
            reports = await self.get_user_reports(user_id, limit=limit)
            
            timeline = [
                {
                    "date": r.get("created_at"),
                    "role": r.get("role"),
                    "overall_score": r.get("overall_score"),
                    "technical": r.get("avg_technical"),
                    "communication": r.get("avg_communication"),
                    "confidence": r.get("avg_confidence"),
                    "report_id": r.get("id")
                }
                for r in reports
            ]
            
            return timeline
            
        except Exception as e:
            logger.error(f"Error getting progress timeline: {e}")
            return []
    
    # ═══════════════════════════════════════════════════════════════════════
    # Report PDF Management
    # ═══════════════════════════════════════════════════════════════════════
    
    async def update_report_pdf_path(self, report_id: str, pdf_path: str) -> bool:
        """
        Update the PDF path for a report.
        
        Args:
            report_id: Report ID
            pdf_path: Path to the stored PDF
            
        Returns:
            True if successful
        """
        try:
            response = (
                self.supabase.table("interview_reports")
                .update({"pdf_path": pdf_path, "updated_at": datetime.now().isoformat()})
                .eq("id", report_id)
                .execute()
            )
            logger.info(f"PDF path updated for report: {report_id}")
            return True
        except Exception as e:
            logger.error(f"Error updating PDF path: {e}")
            return False
    
    async def get_report_pdf_path(self, report_id: str) -> Optional[str]:
        """
        Get the PDF path for a report.
        
        Args:
            report_id: Report ID
            
        Returns:
            PDF path or None
        """
        try:
            report = await self.get_report_by_id(report_id)
            return report.get("pdf_path") if report else None
        except Exception as e:
            logger.error(f"Error getting PDF path: {e}")
            return None