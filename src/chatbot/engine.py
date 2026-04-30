import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import MultiLabelBinarizer
import os
import json

class HealthChatbot:
    def __init__(self, data_dir):
        self.data_dir = data_dir
        self.model = RandomForestClassifier(n_estimators=100, random_state=42)
        self.mlb = MultiLabelBinarizer()
        self.columns = []
        
        # Historical Data Analysis
        self.disease_stats = {}
        self.hospital_stats = {}
        self.forecasting_models = {} 
        
        self.treatment_knowledge = {
            "Malaria": { "meds": { "morning": "Chloroquine Tablet (500mg)", "afternoon": "Paracetamol (650mg)", "night": "Chloroquine Tablet (500mg)" }, "timing": { "morning": "After Breakfast", "afternoon": "After Lunch", "night": "After Dinner" } },
            "Dengue": { "meds": { "morning": "Paracetamol (650mg)", "afternoon": "Vitamin C Supplement", "night": "Paracetamol (650mg)" }, "timing": { "morning": "After Breakfast", "afternoon": "After Lunch", "night": "After Dinner" } },
            "Fungal infection": { "meds": { "morning": "Fluconazole Tablet (150mg)", "afternoon": "Antifungal Cream Application", "night": "Cetirizine Tablet (10mg)" }, "timing": { "morning": "After Breakfast", "afternoon": "Mid-day", "night": "Before Sleep" } },
            "Typhoid": { "meds": { "morning": "Ciprofloxacin Tablet (500mg)", "afternoon": "ORS Solution", "night": "Ciprofloxacin Tablet (500mg)" }, "timing": { "morning": "After Breakfast", "afternoon": "Frequently", "night": "After Dinner" } },
            "Common Cold": { "meds": { "morning": "Phenylephrine Tablet", "afternoon": "Cough Syrup (10ml)", "night": "Diphenhydramine" }, "timing": { "morning": "After Food", "afternoon": "After Food", "night": "Before Sleep" } },
            "default": { "meds": { "morning": "General Antimicrobial", "afternoon": "Multivitamin Tablet", "night": "Pain Reliever" }, "timing": { "morning": "After Breakfast", "afternoon": "After Lunch", "night": "After Dinner" } }
        }
        self.train_all()

    def train_all(self):
        print("[TRAIN] Training AI Model with Random Forest...")
        self.train_symptom_classifier()
        self.train_disease_analyzer()
        self.train_hospital_indexer()
        print("[OK] AI Model Comprehensive Training Complete")

    def train_symptom_classifier(self):
        path = os.path.join(self.data_dir, 'dataset.csv')
        if not os.path.exists(path): 
            print(f"[ERROR] {path} not found")
            return
            
        df = pd.read_csv(path)
        
        # Combine all symptom columns into list
        symptom_list = df.iloc[:, 1:].values.tolist()
        
        # Remove NaN / 0 / empty strings
        cleaned = []
        for row in symptom_list:
            cleaned.append([str(sym).strip().lower().replace('_', ' ') for sym in row if pd.notna(sym) and str(sym) != '0' and str(sym).strip() != 'nan'])
        
        # Apply binarizer
        X_binary = self.mlb.fit_transform(cleaned)
        self.columns = list(self.mlb.classes_)
        
        # Target
        y = df['Disease'].str.strip()
        
        self.model.fit(X_binary, y)
        print(f"[OK] Random Forest Classifier trained on {len(self.columns)} symptom features")

    def train_disease_analyzer(self):
        from sklearn.linear_model import LinearRegression
        for disease in ['dengue', 'malaria']:
            path = os.path.join(self.data_dir, f'{disease}.csv')
            if os.path.exists(path):
                df = pd.read_csv(path)
                df['Month_Num'] = pd.to_datetime(df['Month'], format='%b').dt.month
                self.disease_stats[disease] = {
                    "total_cases": df['Total_Cases'].sum(),
                    "total_deaths": df['Deaths'].sum(),
                    "total_recovered": df['Recovered'].sum(),
                    "avg_death_ratio": df['Death_Rate'].mean(),
                    "by_district": df.groupby('District').agg({
                        'Total_Cases': 'sum', 'Deaths': 'sum', 'Recovered': 'sum',
                        'Death_Rate': 'mean', 'Temperature': 'mean'
                    }).to_dict('index')
                }
                features = ['Year', 'Month_Num', 'Temperature', 'Rainfall']
                X = df[features]
                self.forecasting_models[disease] = {
                    "Total_Cases": LinearRegression().fit(X, df['Total_Cases']),
                    "Confirmed_Cases": LinearRegression().fit(X, df['Confirmed_Cases']),
                    "Recovered": LinearRegression().fit(X, df['Recovered']),
                    "Deaths": LinearRegression().fit(X, df['Deaths'])
                }

    def train_hospital_indexer(self):
        path = os.path.join(self.data_dir, 'hospitals.csv')
        if os.path.exists(path):
            df = pd.read_csv(path)
            self.hospital_stats = {
                "total": len(df),
                "by_district": df['District'].value_counts().to_dict(),
                "details": df.groupby('District').apply(lambda x: x.to_dict('records')).to_dict()
            }

    def predict(self, user_text):
        user_text = user_text.lower()
        result = { 
            "disease": None, "confidence": 0, "district": None, "metric": "Total_Cases", "insights": [],
            "intent": "hospital" if "hospital" in user_text or "medical" in user_text else "query"
        }
        
        # 1. Symptom Diagnosis (Random Forest)
        input_data = [0] * len(self.columns)
        found_any = False
        for i, symptom in enumerate(self.columns):
            if symptom in user_text:
                input_data[i] = 1
                found_any = True
        
        if found_any:
            probs = self.model.predict_proba([input_data])[0]
            max_idx = np.argmax(probs)
            result["disease"] = self.model.classes_[max_idx]
            result["confidence"] = float(probs[max_idx])
            result["treatment"] = self.get_treatment(result["disease"])

        # 2. Metric Detection
        if "recovered" in user_text or "recovery" in user_text: result["metric"] = "Recovered"
        elif "death ratio" in user_text or "death rate" in user_text: result["metric"] = "Death_Rate"
        elif "temperature" in user_text or "temp" in user_text: result["metric"] = "Temperature"
        elif "rainfall" in user_text or "rain" in user_text: result["metric"] = "Rainfall"
        elif "death" in user_text or "dead" in user_text: result["metric"] = "Deaths"
        elif "confirmed" in user_text: result["metric"] = "Confirmed_Cases"
        elif "active" in user_text: result["metric"] = "Active_Cases"

        # 3. District & Resource Detection
        aliases = { "vizag": "Visakhapatnam", "vsp": "Visakhapatnam", "kadapa": "YSR Kadapa", "nellore": "SPSR Nellore", "vijayawada": "NTR" }
        districts = list(self.hospital_stats.get("by_district", {}).keys())
        
        detected_district = None
        for d in districts:
            if d.lower() in user_text:
                detected_district = d
                break
        
        # Check aliases if no direct match
        if not detected_district:
            for alias, official in aliases.items():
                if alias in user_text:
                    detected_district = official
                    break
        
        if detected_district:
            result["district"] = detected_district
            if result["intent"] == "hospital":
                count = self.hospital_stats["by_district"].get(detected_district, 0)
                hosp_list = self.hospital_stats.get("details", {}).get(detected_district, [])[:4]
                rec_str = " Notable facilities: " + ", ".join([h['Hospital_Name'] for h in hosp_list])
                result["insights"].append(f"There are {count} hospitals in {detected_district}.{rec_str}.")

        # 4. Statistical Reasoning
        if "dengue" in user_text or "malaria" in user_text:
            d_type = "dengue" if "dengue" in user_text else "malaria"
            stats = self.disease_stats.get(d_type)
            models = self.forecasting_models.get(d_type)
            if stats:
                if result["district"]:
                    dist_data = stats["by_district"].get(result["district"], {})
                    metric_val = dist_data.get(result["metric"], 0)
                    label = result["metric"].replace("_", " ")
                    val_str = f"{metric_val:.4f}" if "Rate" in result["metric"] else f"{int(metric_val):,}"
                    result["insights"].append(f"{label} for {d_type} in {result['district']}: {val_str}")
                else:
                    total_val = stats.get('total_' + result['metric'].lower(), 0)
                    result["insights"].append(f"State-wide {d_type} {result['metric']}: {total_val:,}")

            # AI Forecast Insight
            if any(x in user_text for x in ["predict", "forecast", "next", "future", "trend"]):
                if models and result["metric"] in models:
                    pred_val = models[result["metric"]].predict([[2025, 8, 30, 150]])[0]
                    result["insights"].append(f"🤖 AI Forecast: Projected {result['metric']} for next month is approx. {int(max(0, pred_val))}")

        return result

    def get_treatment(self, disease):
        return self.treatment_knowledge.get(disease, self.treatment_knowledge["default"])
