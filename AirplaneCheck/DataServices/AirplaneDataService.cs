using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;

using Newtonsoft.Json;

namespace AirplaneCheck
{
	public class AirplaneDataService : IAirplaneDataService
	{
		private string _storagePath;
		private List<AirplaneInfo> _airplaneinfos = new List<AirplaneInfo>(); 

		private int GetNextId() {
			if (_airplaneinfos.Count == 0)
				return 1;
			else
				return _airplaneinfos.Max (p => p.id.Value) + 1;
		}
		private string GetFilename(int id) {
			return Path.Combine (_storagePath, "airplaneinfo" + id.ToString () + ".json");
		}

		public AirplaneDataService ()
		{
		}

		public AirplaneDataService (string storagePath)
		{
			_storagePath = storagePath;

			if (!Directory.Exists (_storagePath))
				Directory.CreateDirectory (_storagePath);

			RefreshCache ();
		}

		#region IAirplaneDataService implementation

		public void RefreshCache ()
		{
			_airplaneinfos.Clear ();
			string[] filenames = Directory.GetFiles (_storagePath, "*.json");
			foreach (string filename in filenames) {
				string airplaneinfostring = File.ReadAllText (filename);
				AirplaneInfo ai = JsonConvert.DeserializeObject<AirplaneInfo> (airplaneinfostring);
				_airplaneinfos.Add (ai);
			}
		}

		public void ClearCache ()
		{
			_airplaneinfos.Clear ();
			string[] filenames = Directory.GetFiles (_storagePath, "*.json");
			foreach (string filename in filenames) {
				File.Delete (filename);
			}
		}

		public AirplaneInfo GetAirplaneInfo (int id)
		{
			AirplaneInfo ai = _airplaneinfos.Find (p => p.id == id);
			return ai;
		}

		public void SaveAirplaneInfo (AirplaneInfo ai)
		{
			Boolean newAirplaneInfo = false;
			if (!ai.id.HasValue) {
				ai.id = GetNextId ();
				newAirplaneInfo = true;
			}

			string AirplaneInfoString = JsonConvert.SerializeObject (ai);
			File.WriteAllText (GetFilename (ai.id.Value), AirplaneInfoString);

			if (newAirplaneInfo) {
				_airplaneinfos.Add (ai);
			}
		}

		public void DeleteAirplaneInfo (AirplaneInfo ai)
		{
			File.Delete (GetFilename (ai.id.Value));
			_airplaneinfos.Remove (ai);
		}

		public IReadOnlyList<AirplaneInfo> AirplaneInfos {
			get {
				return _airplaneinfos;
			}
		}

		#endregion
	}
}

