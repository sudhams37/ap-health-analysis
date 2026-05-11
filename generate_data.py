import pandas as pd
import numpy as np
import os
import json

# Set seed for reproducibility
np.random.seed(42)

def generate_synthetic_data(data_dir):
    print("Generating synthetic health data...")
    
    # Load districts to get realistic coordinates
    with open(os.path.join(data_dir, 'districts_geo.json'), 'r') as f:
        geo_data = json.load(f)
    
    districts = []
    for feature in geo_data['features']:
        name = feature['properties'].get('district') or feature['properties'].get('name')
        # Simple centroid approximation
        coords = np.array(feature['geometry']['coordinates'][0])
        if feature['geometry']['type'] == 'MultiPolygon':
             coords = np.array(feature['geometry']['coordinates'][0][0])
        
        centroid = np.mean(coords, axis=0)
        districts.append({'name': name, 'center_lon': centroid[0], 'center_lat': centroid[1]})

    n_cases = 1000
    cases = []
    
    # Create clusters in 3 districts (e.g., Visakhapatnam, NTR, Chittoor)
    hotspot_districts = ['Visakhapatnam', 'NTR', 'Chittoor']
    hotspots = [d for d in districts if d['name'] in hotspot_districts]
    
    for i in range(n_cases):
        # Pick a district, higher probability for hotspots
        if np.random.random() < 0.6:
            target = np.random.choice(hotspots)
            scale = 0.08 # Tighter cluster
        else:
            target = np.random.choice(districts)
            scale = 0.2 # Scattered
            
        lon = np.random.normal(loc=target['center_lon'], scale=scale)
        lat = np.random.normal(loc=target['center_lat'], scale=scale)
        
        age = np.random.randint(1, 90)
        gender = np.random.choice(['M', 'F'])
        
        # Clinical features
        readmission_risk = 1 if (age > 60 and np.random.random() < 0.6) or np.random.random() < 0.2 else 0
        vaccination_status = np.random.choice([0, 1], p=[0.3, 0.7])
        
        # Disease assignment
        disease = np.random.choice(['Malaria', 'Dengue', 'Typhoid', 'Common Cold', 'Fungal infection'])
        
        cases.append({
            'Patient_ID': i + 1,
            'District': target['name'],
            'Age': age,
            'Gender': gender,
            'Latitude': lat,
            'Longitude': lon,
            'Disease': disease,
            'Readmission': readmission_risk,
            'Vaccinated': vaccination_status,
            'Symptoms': 'fever, headache' if disease == 'Malaria' else 'rash' if disease == 'Fungal infection' else 'cough, cold'
        })

    df = pd.DataFrame(cases)
    df.to_csv(os.path.join(data_dir, 'synthetic_cases.csv'), index=False)
    print(f"Generated 1000 cases in synthetic_cases.csv")

if __name__ == "__main__":
    base_dir = os.path.join(os.path.dirname(__file__), 'data', 'raw')
    generate_synthetic_data(base_dir)
