import pandas as pd
import io

def generate_reports_excel(reports: list, mill: dict, user: dict) -> io.BytesIO:
    # Build a list of flat dictionaries
    flat_data = []
    
    mill_name = mill.get("name", "")
    mill_location = mill.get("location", "")
    spindles_installed = mill.get("installed_spindles", 0)
    rotors_installed = mill.get("installed_rotors", 0)
    zone = user.get("department", "Global")
    
    for r in reports:
        # Split month/year (e.g. "2026-08")
        reporting_month_str = r.get("reporting_month", "")
        try:
            parts = reporting_month_str.split("-")
            r_year = parts[0] if len(parts) > 0 else ""
            r_month = parts[1] if len(parts) > 1 else ""
        except:
            r_year, r_month = "", ""
            
        # Yarn processing
        def flatten_yarn(yarn_list):
            if not yarn_list: return ""
            return ", ".join([f"{y.get('count', '')}: {y.get('quantity', 0)}kg" for y in yarn_list])
            
        yarn_cotton = flatten_yarn(r.get("yarn_cotton", []))
        yarn_blended = flatten_yarn(r.get("yarn_blended", []))
        yarn_synthetic = flatten_yarn(r.get("yarn_synthetic", []))
        
        # Payment details
        payment_details = r.get("payment_details", [])
        remittance_types = ", ".join([p.get("method", "") for p in payment_details])
        remittance_notes = ", ".join([p.get("details", "") for p in payment_details])
        
        rm_dom = r.get("raw_material_domestic") or {}
        rm_imp = r.get("raw_material_imported") or {}
        rm_syn = r.get("raw_material_synthetic") or {}
        
        row = {
            # Module 1
            "Report_UID": str(r.get("_id", r.get("id", ""))),
            "User_ID": str(r.get("user_id", "")),
            "Mill_Name": mill_name,
            "Zone": zone,
            "Reporting_Month": r_month,
            "Reporting_Year": int(r_year) if r_year.isdigit() else r_year,
            "Avg_Ring_Spindles": r.get("worked_spindles", 0),
            "Avg_Rotors": r.get("worked_rotors", 0),
            "Cotton_Pressed_KG": r.get("pressed_cotton_kg", 0),
            "Cotton_Pressed_Bales": r.get("pressed_cotton_kg", 0) / 170.0,
            "Cotton_Unpressed_KG": r.get("unpressed_cotton_kg", 0),
            "Cotton_Unpressed_Bales": r.get("unpressed_cotton_kg", 0) / 170.0,
            "Total_Cotton_KG": r.get("pressed_cotton_kg", 0) + r.get("unpressed_cotton_kg", 0),
            "Total_Cotton_Bales": (r.get("pressed_cotton_kg", 0) + r.get("unpressed_cotton_kg", 0)) / 170.0,
            "Cess_Rate_Per_Bale": r.get("cess_per_bale", 0),
            "Total_Cess_Amount_RS": ((r.get("pressed_cotton_kg", 0) + r.get("unpressed_cotton_kg", 0)) / 170.0) * r.get("cess_per_bale", 0),
            "Amount_Remitted_RS": r.get("remitted_amount", 0),
            "Remittance_Type": remittance_types,
            "Remittance_Details": remittance_notes,
            
            # Module 2
            "Mill_Location": mill_location,
            "Spindles_Installed": spindles_installed,
            "Spindles_Worked": r.get("worked_spindles", 0),
            "Rotors_Installed": rotors_installed,
            "Rotors_Worked": r.get("worked_rotors", 0),
            "Working_Days": r.get("working_days", 0),
            "No_of_Shifts": r.get("shifts", 0),
            "Yarn_Counts_Cotton": yarn_cotton,
            "Yarn_Counts_Blended": yarn_blended,
            "Yarn_Counts_Synthetic": yarn_synthetic,
            
            # Module 3
            "RM_Opening_Domestic": rm_dom.get("opening", 0),
            "RM_Opening_Imported": rm_imp.get("opening", 0),
            "RM_Opening_Synthetic": rm_syn.get("opening", 0),
            "RM_Procure_Domestic": rm_dom.get("procurement", 0),
            "RM_Procure_Imported": rm_imp.get("procurement", 0),
            "RM_Procure_Synthetic": rm_syn.get("procurement", 0),
            "RM_Consum_Domestic": rm_dom.get("consumption", 0),
            "RM_Consum_Imported": rm_imp.get("consumption", 0),
            "RM_Consum_Synthetic": rm_syn.get("consumption", 0),
            "RM_Closing_Domestic": rm_dom.get("closing", 0),
            "RM_Closing_Imported": rm_imp.get("closing", 0),
            "RM_Closing_Synthetic": rm_syn.get("closing", 0),
            
            # Module 4
            "Last_Payment_RS": r.get("last_payment_amount", 0),
            "Last_Payment_Date": r.get("last_payment_date", ""),
            "Outstanding_Cess_RS": r.get("outstanding_cess", 0),
            "Cess_Paid_Current_Month": r.get("cess_paid_this_month", 0),
            "Submission_Timestamp": str(r.get("created_at", ""))
        }
        flat_data.append(row)
        
    df = pd.DataFrame(flat_data)
    
    # Write to BytesIO
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Monthly_Returns')
        
    output.seek(0)
    return output
