import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import MultiLabelBinarizer
import os
import json

class HealthChatbot:
    def __init__(self, data_dir):
        self.data_dir = data_dir
        # Primary Symptom Classifier
        self.symptom_model = RandomForestClassifier(n_estimators=100, random_state=42)
        self.mlb = MultiLabelBinarizer()
        self.symptom_columns = []
        
        # Regional Risk Classifier (Rainfall, Temp, etc.)
        self.risk_model = RandomForestClassifier(n_estimators=100, random_state=42)
        self.risk_features = ['Temperature', 'Rainfall', 'Year', 'Month_Num']
        
        # Stats & Metadata
        self.disease_stats = {}
        self.hospital_stats = {}
        self.forecasting_models = {} 
        
        self.diet_knowledge = {
            "Malaria": { "morning": "Warm water with Lemon, Oats or Ragi Porridge", "afternoon": "Steamed Rice with Dal, Coconut Water", "night": "Clear Vegetable Soup, Moong Dal Khichdi" },
            "Dengue": { "morning": "Papaya Leaf Extract (small amount), Fresh Fruit Bowl", "afternoon": "Electrolyte-rich juices, Pomegranate, Boiled Egg", "night": "Light Vegetable Broth, Soft Steamed Rice" },
            "Fungal infection": { "morning": "Curd/Yogurt (Probiotics), Garlic-infused tea", "afternoon": "Green leafy vegetables, Whole grain bread", "night": "Turmeric Milk, Light salad with olive oil" },
            "Typhoid": { "morning": "White bread with honey, Herbal tea", "afternoon": "Mashed potatoes, Soft boiled rice with curd", "night": "Vegetable puree, clear liquids" },
            "Common Cold": { "morning": "Ginger-Tulsi Tea, Hot milk with turmeric", "afternoon": "Mixed vegetable soup, Steamed sprouts", "night": "Garlic soup, Light wheat rotis" },
            "default": { "morning": "Warm fluids, Seasonal fruits", "afternoon": "Balanced meal with protein and veggies", "night": "Light, non-spicy dinner" }
        }
        
        self.train_all()

    def train_all(self):
        print("[ML] Initializing Comprehensive AI Training Suite...")
        self.train_symptom_classifier()
        self.train_disease_analyzer()
        self.train_hospital_indexer()
        self.train_risk_model()
        print("[OK] All ML Models Trained and Active.")

    def train_symptom_classifier(self):
        """Trains a high-fidelity Random Forest Classifier using dataset.csv."""
        path = os.path.join(self.data_dir, 'dataset.csv')
        if not os.path.exists(path): 
            print("[ERROR] dataset.csv missing. Symptom AI disabled.")
            return
            
        df = pd.read_csv(path)
        # Extract all symptom columns (Symptom_1 to Symptom_17)
        symptom_rows = df.iloc[:, 1:].values.tolist()
        
        normalized_data = []
        for row in symptom_rows:
            # High-fidelity cleaning: remove nulls, strip whitespace, replace underscores with spaces, 
            # and handle double spaces or ' _' patterns found in the dataset.
            clean_row = [
                str(s).strip().lower().replace('_', ' ').replace('  ', ' ').replace('  ', ' ')
                for s in row if pd.notna(s) and str(s).strip() not in ['0', 'nan', '']
            ]
            normalized_data.append(clean_row)
        
        # Binary encoding of symptoms for ML ingestion
        X_binary = self.mlb.fit_transform(normalized_data)
        self.symptom_columns = list(self.mlb.classes_)
        y = df['Disease'].str.strip()
        
        self.symptom_model.fit(X_binary, y)
        print(f"[ML] Symptom Engine Trained: {len(self.symptom_columns)} clinical signs mapped to {len(set(y))} distinct diseases.")

    def train_disease_analyzer(self):
        """Builds statistical maps and forecasting logic for epidemic data."""
        from sklearn.linear_model import LinearRegression
        for d_name in ['dengue', 'malaria']:
            path = os.path.join(self.data_dir, f'{d_name}.csv')
            if os.path.exists(path):
                df = pd.read_csv(path)
                df['Month_Num'] = pd.to_datetime(df['Month'], format='%b').dt.month
                
                # Define available metrics for this specific dataset
                all_possible_metrics = {
                    'Total_Cases': 'sum', 'Deaths': 'sum', 'Recovered': 'sum',
                    'Active_Cases': 'sum', 'Pf_Cases': 'sum', 'Pv_Cases': 'sum',
                    'Severe_Cases': 'sum', 'Mild_Cases': 'sum',
                    'Rainfall': 'mean', 'Temperature': 'mean', 'Population': 'max'
                }
                
                # Filter to only columns that actually exist in this CSV
                existing_metrics = {k: v for k, v in all_possible_metrics.items() if k in df.columns}
                
                self.disease_stats[d_name] = {
                    "total_cases": int(df['Total_Cases'].sum()),
                    "total_deaths": int(df['Deaths'].sum()) if 'Deaths' in df.columns else 0,
                    "total_recovered": int(df['Recovered'].sum()) if 'Recovered' in df.columns else 0,
                    "avg_incidence": float(df['Incidence_Rate'].mean()) if 'Incidence_Rate' in df.columns else 0,
                    "by_district": df.groupby('District').agg(existing_metrics).to_dict('index')
                }
                
                # Forecasting models for various metrics (only if columns exist)
                X = df[['Year', 'Month_Num', 'Temperature', 'Rainfall']]
                forecastable = [col for col in ['Total_Cases', 'Deaths', 'Recovered', 'Active_Cases'] if col in df.columns]
                self.forecasting_models[d_name] = {
                    col: LinearRegression().fit(X, df[col]) for col in forecastable
                }

    def train_risk_model(self):
        """Trains a Random Forest to predict outbreak severity based on environmental factors."""
        all_data = []
        for d in ['dengue', 'malaria']:
            p = os.path.join(self.data_dir, f'{d}.csv')
            if os.path.exists(p):
                df = pd.read_csv(p)
                df['Month_Num'] = pd.to_datetime(df['Month'], format='%b').dt.month
                df['Disease_Label'] = d
                all_data.append(df)
        
        if all_data:
            master = pd.concat(all_data)
            # Label: High Risk if incidence > median
            median_inc = master['Incidence_Rate'].median()
            master['High_Risk'] = (master['Incidence_Rate'] > median_inc).astype(int)
            
            X = master[self.risk_features]
            y = master['High_Risk']
            self.risk_model.fit(X, y)

    def train_hospital_indexer(self):
        path = os.path.join(self.data_dir, 'hospitals.csv')
        if os.path.exists(path):
            df = pd.read_csv(path)
            self.hospital_stats = {
                "by_district": df['District'].value_counts().to_dict(),
                "details": df.groupby('District').apply(lambda x: x.to_dict('records')).to_dict()
            }

    def predict(self, user_text):
        low_text = user_text.lower()
        result = { 
            "disease": None, "confidence": 0, "district": None, "metric": "Total_Cases", 
            "insights": [], "intent": "query", "target_disease": None 
        }
        
        if "hospital" in low_text or "clinic" in low_text or "medical" in low_text: result["intent"] = "hospital"
        if "dengue" in low_text: result["target_disease"] = "Dengue"
        elif "malaria" in low_text: result["target_disease"] = "Malaria"

        # 1. Symptom Classification (Random Forest)
        # Bridge the gap between natural language and clinical dataset labels
        symptom_aliases = {
            "fever": ["high fever", "mild fever"],
            "cold": ["runny nose", "continuous sneezing", "cough"],
            "ache": ["muscle pain", "joint_pain", "headache"],
            "pain": ["muscle pain", "joint_pain", "abdominal_pain"],
            "rash": ["skin rash"],
            "vomit": ["vomiting"],
            "sneezing": ["continuous sneezing"],
            "head": ["headache"]
        }
        
        input_bits = [0] * len(self.symptom_columns)
        found_any = False
        
        # Check aliases first to boost recall
        for word, targets in symptom_aliases.items():
            if word in low_text:
                for target in targets:
                    if target in self.symptom_columns:
                        input_bits[self.symptom_columns.index(target)] = 1
                        found_any = True
        
        # Check for direct dataset label matches
        for i, sym in enumerate(self.symptom_columns):
            if sym in low_text:
                input_bits[i] = 1
                found_any = True
            elif ' ' in sym:
                parts = sym.split()
                if all(p in low_text for p in parts):
                    input_bits[i] = 1
                    found_any = True
        
        if found_any:
            probs = self.symptom_model.predict_proba([input_bits])[0]
            idx = np.argmax(probs)
            result["disease"] = self.symptom_model.classes_[idx]
            result["confidence"] = float(probs[idx])
            result["treatment"] = self.diet_knowledge.get(result["disease"], self.diet_knowledge.get(result["disease"].replace(' ',''), self.diet_knowledge["default"]))
        else:
            result["insights"].append("I'm ready. Please describe your symptoms (e.g. 'I have a rash and itching') for a clinical evaluation.")
        metric_keywords = {
            "pf": "Pf_Cases", "pv": "Pv_Cases", "active": "Active_Cases", "death": "Deaths",
            "mortality": "Deaths", "recovered": "Recovered", "rainfall": "Rainfall", "rain": "Rainfall",
            "temp": "Temperature", "weather": "Temperature", "population": "Population", "incidence": "Incidence_Rate"
        }
        for k, v in metric_keywords.items():
            if k in low_text: result["metric"] = v
        
        # 3. District Mapping
        for dist in district_names: # Assume defined elsewhere or detect from keys
            if dist.lower() in low_text: result["district"] = dist; break
        
        # 4. Statistical Insight Generation
        target = result["target_disease"].lower() if result["target_disease"] else "malaria"
        stats = self.disease_stats.get(target)
        if stats and result["district"]:
            d_stats = stats["by_district"].get(result["district"], {})
            val = d_stats.get(result["metric"], 0)
            unit = "°C" if result["metric"] == "Temperature" else ("mm" if result["metric"] == "Rainfall" else "")
            result["insights"].append(f"In {result['district']}, {result['metric'].replace('_',' ')} for {target} is {val}{unit}.")
        
        return result

# Helper for district detection
district_names = ["Alluri Sitarama Raju", "Anakapalli", "Anantapur", "Annamayya", "Bapatla", "Chittoor", "Dr. B.R. Ambedkar Konaseema", "East Godavari", "Eluru", "Guntur", "Kakinada", "Konaseema", "Krishna", "Kurnool", "Nandyal", "NTR", "Palnadu", "Parvathipuram Manyam", "Prakasam", "SPSR Nellore", "Sri Potti Sriramulu Nellore", "Sri Sathya Sai", "Srikakulam", "Tirupati", "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR", "YSR Kadapa"]
