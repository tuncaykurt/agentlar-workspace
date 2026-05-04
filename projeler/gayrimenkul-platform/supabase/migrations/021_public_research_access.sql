-- Allow public (anon) read access to property researches
-- This is required for customers to view their valuation reports without logging in

CREATE POLICY "Public read access on property_researches" 
ON property_researches 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Allow public (anon) read access to consultants basic info
-- This is required for displaying consultant details on the public report page
CREATE POLICY "Public read access on consultants for reports" 
ON consultants 
FOR SELECT 
TO anon, authenticated 
USING (true);
