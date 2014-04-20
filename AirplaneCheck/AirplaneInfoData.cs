using System;
using System.IO;

namespace AirplaneCheck
{
	public class AirplaneInfoData
	{
		static string _externalstorage = Path.Combine(Android.OS.Environment.ExternalStorageDirectory.Path, "AirplaneCheck");
		public static readonly IAirplaneDataService Service = new AirplaneDataService(_externalstorage);
	}
}

